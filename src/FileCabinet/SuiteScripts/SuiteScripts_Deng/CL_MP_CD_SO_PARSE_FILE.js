/**
 * Cdiscount订单文件解析
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
 */
define(['N/record', 'N/search',  'N/xml', 'N/file', 'N/runtime'], 
(record, search, xml, file, runtime) => {

    const cdPlatform = 24;
    const orderType = 1;

    const getInputData = () => {
        let allFile = [];
        let parseFileSearchId = runtime.getCurrentScript().getParameter('custscript4');
        let mySearch = search.load(parseFileSearchId);
        mySearch.filters.push(
            search.createFilter({
                name: 'custrecord_sales_platform',
                operator: search.Operator.IS,
                values: cdPlatform
            }),
            search.createFilter({
                name: 'custrecord_data_type',
                operator: search.Operator.IS,
                values: orderType
            })
        );
        mySearch.run().each(function(result) {
            allFile[allFile.length] = result;
            return true;
        });
        return allFile;
    }

    const map = (context) => {
        try{
            let value = JSON.parse(context.value);
            log.debug('value', value);
            let rec = record.load({
                type: 'customrecord_file_analysis_list',
                id: value.id
            });

            let orderFile = file.load({
                id: rec.getValue('custrecord_file_url')
            }).getContents();

            let xmlDocument = xml.Parser.fromString({
                text: orderFile
            });
            let bookNode = xml.XPath.select({
                node: xmlDocument,
                xpath: '//s:Body'
            });
            let GetOrderListResponse = bookNode[0].getElementsByTagName({
                tagName: 'GetOrderListResponse'
            });
            let GetOrderListResult = GetOrderListResponse[0].getElementsByTagName({
                tagName: 'GetOrderListResult'
            });
            let OrderList = GetOrderListResult[0].getElementsByTagName({
                tagName: 'OrderList'
            });
            let order = OrderList[0].getElementsByTagName({
                tagName: 'Order'
            });
            let orderNumbers = [];
            for(let i = 0 ; i < order.length ; i++){
                let orderNumber = parseOrderGetOrderNumber(order[i]);
                orderNumbers[orderNumbers.length] = orderNumber;
            }
            let searchOrder = searchCDOrder(orderNumbers);  //根据店铺单号搜索相关Cdiscount订单记录
            log.debug('searchOrder', searchOrder);
            let orderList = [];
            for(let i = 0 ; i < order.length ; i++){
                let orderObj = parseOrder(order[i]);
                orderList[i] = orderObj;
            }
            context.write({
                key: value.id,
                value: {
                    'orderList': orderList,
                    'searchOrder': searchOrder
                }
            });
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const reduce = (context) => {
        try{
            let orderList = JSON.parse(context.values[0]).orderList;
            for(let key in orderList){
                createOrderRecord(context.key, orderList[key], JSON.parse(context.values[0]).searchOrder);
            }
            record.submitFields({
                type:'customrecord_file_analysis_list',
                id: context.key,
                values:{
                    'custrecordanalysis_status': true
                }
            });
        }catch(e) {
            log.debug('error',e.message + e.stack);
        }
    }

    const summarize = (summary) => {
        log.debug('', 'end');
    }

    /**
     * search 'customrecord_cd_order' filters custrecord_cd_ordernumber
     * @param {*} orderNumbers 店铺单号[]
     */
    const searchCDOrder = (orderNumbers) => {
        let filters = [];
        for(let i = 0;i < orderNumbers.length ; i++) {
            let filter;
            if(i == 0) {
                filter =  ['custrecord_cd_ordernumber', 'IS', orderNumbers[0]];
                filters[filters.length] = filter;
            }
            else if(i > 0) {
                filter =  ['custrecord_cd_ordernumber', 'IS', orderNumbers[i]];
                filters[filters.length] = 'OR';
                filters[filters.length] = filter;
            }
        }
        log.debug('filters', filters);

        let searchOrder = {};
        let orderSearch = search.create({
            type: 'customrecord_cd_order',
            columns: ['custrecord_cd_ordernumber']
        });
        orderSearch.filterExpression = filters;
        orderSearch.run().each(function(result) {
            searchOrder[result.getValue('custrecord_cd_ordernumber')] = result.id;
            return true;
        });
        return searchOrder;
    }

    /**
     * 创建CD订单自定义记录
     * @param {*} parseFileId 文件解析列表
     * @param {*} order 订单
     */
    const createOrderRecord = (parseFileId, order, searchOrder) => {
        let orderLineList = [];
        let recId = searchOrder[order.custrecord_cd_ordernumber];
        let rec = recId?record.load({
            type: 'customrecord_cd_order',
            id: recId
        }):record.create({
            type: 'customrecord_cd_order'
        });
        log.debug(recId?'load':'create', order.custrecord_cd_ordernumber);
        
        rec.setValue('name', order.custrecord_cd_ordernumber);
        for(let key in order){
            if(key == 'OrderLineList') {
                orderLineList = order[key];
            }else if(key == 'BillingAddress' || key == 'Corporation' || 
                key == 'ShippingAddress' || key == 'Customer') {
                let childObj = order[key];
                for(let childKey in childObj){
                    rec.setValue(childKey, childObj[childKey]);
                }
            }else if(key == 'VoucherList') {
                rec.setValue('custrecord_cd_voucherlist', JSON.stringify(order[key]))
            }else{
                rec.setValue(key, order[key]);
            }
        }
        rec.setValue('custrecord_cd_file_parse_list',parseFileId);
        let parseFileRec = search.lookupFields({
            type: 'customrecord_file_analysis_list',
            id: parseFileId,
            columns: ['custrecord_seller_dev_1']
        });
        rec.setValue('custrecord_cd_so_store', parseFileRec.custrecord_seller_dev_1[0].value);
        rec.setValue('custrecord_cd_so_status', 'PLATFORM_ORDER');
        recId = rec.save();
        log.debug('CD订单', recId);
        createOrderLine(recId, orderLineList);
    }

    /**
     * 创建CD订单明细
     * @param {*} recId 订单头部ID
     * @param {*} orderLineList 订单明细
     */
    const createOrderLine = (recId, orderLineList) => {
        let searchOrderLine = {};
        search.create({
            type: 'customrecord_cd_order_item',
            filters: [
                ['custrecord_cd_order_record','is',recId]
            ],
            columns: ['name']
        }).run().each(function(result){
            searchOrderLine[result.getValue('name')] = result.id;
            return true;
        });
        
        for(let orderLineKey in orderLineList){
            let orderLine = orderLineList[orderLineKey];
            let rec;
            if(searchOrderLine[recId+'{}'+orderLine['custrecord_cd_item_rowid']]) {
                rec = record.load({
                    type: 'customrecord_cd_order_item', 
                    id: searchOrderLine[recId+'{}'+orderLine['custrecord_cd_item_rowid']]
                });
            }else{
                rec = record.create({
                    type: 'customrecord_cd_order_item'
                });
            }
            for(let key in orderLine){
                rec.setValue(key, orderLine[key]);
            }
            rec.setValue('custrecord_cd_order_record', recId);
            rec.setValue('custrecord_cd_order_item_status', 'PLATFORM_ORDER');
            rec.setValue('name', recId+'{}'+orderLine['custrecord_cd_item_rowid']);
            let recItemId = rec.save();
            log.debug('CD订单明细',recItemId);
        }
    };

    /**
     * 获取订单编号
     * @param {*} order 
     */
    const parseOrderGetOrderNumber = (order) => {
        return order.getElementsByTagName({
            tagName: 'OrderNumber'
        })[0].textContent;
    }

    /**
     * 暴力解析XML订单
     * @param {*} order order-xml
     */
    const parseOrder = (order) => {
        let orderObj = {};
        let ArchiveParcelList = order.getElementsByTagName({
            tagName: 'ArchiveParcelList'
        })[0].textContent;
        orderObj.ArchiveParcelList = ArchiveParcelList;

        //=================================================BillingAddress
        let BillingAddressObj = {};
        let BillingAddress = order.getElementsByTagName({
            tagName: 'BillingAddress'
        })[0];
        let BillingAddressAddress1 = BillingAddress.getElementsByTagName({
            tagName: 'Address1'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billingaddress_address1 = BillingAddressAddress1;
        let BillingAddressAddress2 = BillingAddress.getElementsByTagName({
            tagName: 'Address2'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billingaddress_address2 = BillingAddressAddress2;
        let BillingAddressApartmentNumber = BillingAddress.getElementsByTagName({
            tagName: 'ApartmentNumber'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_apartmentnumber = BillingAddressApartmentNumber;
        let BillingAddressBuilding = BillingAddress.getElementsByTagName({
            tagName: 'Building'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_building = BillingAddressBuilding;
        let BillingAddressCity = BillingAddress.getElementsByTagName({
            tagName: 'City'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_city = BillingAddressCity;
        let BillingAddressCivility = BillingAddress.getElementsByTagName({
            tagName: 'Civility'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_civility = BillingAddressCivility;
        let BillingAddressCompanyName = BillingAddress.getElementsByTagName({
            tagName: 'CompanyName'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_companyname = BillingAddressCompanyName;
        let BillingAddressCountry = BillingAddress.getElementsByTagName({
            tagName: 'Country'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_country = BillingAddressCountry;
        let BillingAddressCounty = BillingAddress.getElementsByTagName({
            tagName: 'County'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_county = BillingAddressCounty;
        let BillingAddressFirstName = BillingAddress.getElementsByTagName({
            tagName: 'FirstName'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_firstname = BillingAddressFirstName;
        let BillingAddressInstructions = BillingAddress.getElementsByTagName({
            tagName: 'Instructions'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_instructions = BillingAddressInstructions;
        let BillingAddressLastName = BillingAddress.getElementsByTagName({
            tagName: 'LastName'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_lastname = BillingAddressLastName;
        let BillingAddressLatitude = BillingAddress.getElementsByTagName({
            tagName: 'Latitude'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_latitude = BillingAddressLatitude;
        let BillingAddressLongitude = BillingAddress.getElementsByTagName({
            tagName: 'Longitude'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_longitude = BillingAddressLongitude;
        let BillingAddressPlaceName = BillingAddress.getElementsByTagName({
            tagName: 'PlaceName'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_placename = BillingAddressPlaceName;
        let BillingAddressRelayId = BillingAddress.getElementsByTagName({
            tagName: 'RelayId'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_relayid = BillingAddressRelayId;
        let BillingAddressStreet = BillingAddress.getElementsByTagName({
            tagName: 'Street'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_street = BillingAddressStreet;
        let BillingAddressZipCode = BillingAddress.getElementsByTagName({
            tagName: 'ZipCode'
        })[0].textContent;
        BillingAddressObj.custrecord_cd_billing_zipcode = BillingAddressZipCode;
        orderObj['BillingAddress'] = BillingAddressObj;

        let BusinessOrder = order.getElementsByTagName({
            tagName: 'BusinessOrder'
        })[0].textContent;
        orderObj.custrecord_cd_businessorder = BusinessOrder;

        //=================================================Corporation
        let CorporationObj = {};
        let Corporation = order.getElementsByTagName({
            tagName: 'Corporation'
        })[0];
        let CorporationBusinessUnitId = Corporation.getElementsByTagName({
            tagName: 'BusinessUnitId'
        })[0].textContent;
        CorporationObj.custrecord_cd_corporation_businessunitid = CorporationBusinessUnitId;
        let CorporationCorporationCode = Corporation.getElementsByTagName({
            tagName: 'CorporationCode'
        })[0].textContent;
        CorporationObj.custrecord_cd_corporation_code = CorporationCorporationCode;
        let CorporationCorporationId = Corporation.getElementsByTagName({
            tagName: 'CorporationId'
        })[0].textContent;
        CorporationObj.custrecord_cd_corporation_id = CorporationCorporationId;
        let CorporationCorporationName = Corporation.getElementsByTagName({
            tagName: 'CorporationName'
        })[0].textContent;
        CorporationObj.custrecord_cd_corporation_name = CorporationCorporationName;
        let CorporationIsMarketPlaceActive = Corporation.getElementsByTagName({
            tagName: 'IsMarketPlaceActive'
        })[0].textContent;
        CorporationObj.custrecord_cd_corporation_ismarketplacea = CorporationIsMarketPlaceActive;
        orderObj['Corporation'] = CorporationObj;

        let CreationDate = order.getElementsByTagName({
            tagName: 'CreationDate'
        })[0].textContent;
        orderObj.custrecord_cd_creationdate = CreationDate;
        let CurrencyCode = order.getElementsByTagName({
            tagName: 'CurrencyCode'
        })[0].textContent;
        orderObj.custrecord_cd_currencycode = CurrencyCode;

        //=================================================Customer
        let CustomerObj = {};
        let Customer = order.getElementsByTagName({
            tagName: 'Customer'
        })[0];
        let CustomerCivility = Customer.getElementsByTagName({
            tagName: 'Civility'
        })[0].textContent;
        CustomerObj.custrecord_cd_customer_civility = CustomerCivility;
        let CustomerCustomerId = Customer.getElementsByTagName({
            tagName: 'CustomerId'
        })[0].textContent;
        CustomerObj.custrecord_cd_customer_id = CustomerCustomerId;
        let CustomerEmail = Customer.getElementsByTagName({
            tagName: 'Email'
        })[0].textContent;
        CustomerObj.custrecord_cd_customer_email = CustomerEmail;
        let CustomerEncryptedEmail = Customer.getElementsByTagName({
            tagName: 'EncryptedEmail'
        })[0].textContent;
        CustomerObj.custrecord_cd_customer_encryptedemail = CustomerEncryptedEmail;
        let CustomerFirstName = Customer.getElementsByTagName({
            tagName: 'FirstName'
        })[0].textContent;
        CustomerObj.custrecord_cd_customer_firstname = CustomerFirstName;
        let CustomerLastName = Customer.getElementsByTagName({
            tagName: 'LastName'
        })[0].textContent;
        CustomerObj.custrecord_cd_customer_lastname = CustomerLastName;
        let CustomerMobilePhone = Customer.getElementsByTagName({
            tagName: 'MobilePhone'
        })[0].textContent;
        CustomerObj.custrecord_cd_customer_mobilephone = CustomerMobilePhone;
        let CustomerPhone = Customer.getElementsByTagName({
            tagName: 'Phone'
        })[0].textContent;
        CustomerObj.custrecord_cd_customer_phone = CustomerPhone;
        let CustomerShippingFirstName = Customer.getElementsByTagName({
            tagName: 'ShippingFirstName'
        })[0].textContent;
        CustomerObj.custrecord_cd_customer_shippingfirstname = CustomerShippingFirstName;
        let CustomerShippingLastName = Customer.getElementsByTagName({
            tagName: 'ShippingLastName'
        })[0].textContent;
        CustomerObj.custrecord_cd_customer_shippinglastname = CustomerShippingLastName;
        orderObj['Customer'] = CustomerObj;

        let HasClaims = order.getElementsByTagName({
            tagName: 'HasClaims'
        })[0].textContent;
        orderObj.custrecord_cd_hasclaims = HasClaims;
        let InitialTotalAmount = order.getElementsByTagName({
            tagName: 'InitialTotalAmount'
        })[0].textContent;
        orderObj.custrecord_cd_initialtotalamount = InitialTotalAmount;
        let InitialTotalShippingChargesAmount = order.getElementsByTagName({
            tagName: 'InitialTotalShippingChargesAmount'
        })[0].textContent;
        orderObj.custrecord_cd_initialtotalshippingcharge = InitialTotalShippingChargesAmount;
        let IsCLogistiqueOrder = order.getElementsByTagName({
            tagName: 'IsCLogistiqueOrder'
        })[0].textContent;
        orderObj.custrecord_cd_isclogistiqueorder = IsCLogistiqueOrder;
        let IsEligibileSubstitution = order.getElementsByTagName({
            tagName: 'IsEligibileSubstitution'
        })[0].textContent;
        orderObj.custrecord_cd_iseligibilesubstitution = IsEligibileSubstitution;
        let LastUpdatedDate = order.getElementsByTagName({
            tagName: 'LastUpdatedDate'
        })[0].textContent;
        orderObj.custrecord_cd_lastupdateddate = LastUpdatedDate;
        let ModGesLog = order.getElementsByTagName({
            tagName: 'ModGesLog'
        })[0].textContent;
        orderObj.custrecord_cd_modgeslog = ModGesLog;
        let ModifiedDate = order.getElementsByTagName({
            tagName: 'ModifiedDate'
        })[0].textContent;
        orderObj.custrecord_cd_modifieddate = ModifiedDate;
        let Offer = order.getElementsByTagName({
            tagName: 'Offer'
        })[0].textContent;
        orderObj.custrecord_cd_offer = Offer;

        //======================================================OrderLineList
        let OrderLineListObj = [];
        let OrderLineList = order.getElementsByTagName({
            tagName: 'OrderLineList'
        })[0];
        let OrderLine = OrderLineList.getElementsByTagName({
            tagName: 'OrderLine'
        });
        for(let i = 0 ; i < OrderLine.length ; i ++){
            let OrderLineObj = {};
            let AcceptationState = OrderLine[i].getElementsByTagName({
                tagName: 'AcceptationState'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_acceptationstate = AcceptationState;
            let CancellationReason = OrderLine[i].getElementsByTagName({
                tagName: 'CancellationReason'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_cancellationreason = CancellationReason;
            let CategoryCode = OrderLine[i].getElementsByTagName({
                tagName: 'CategoryCode'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_categorycode = CategoryCode;
            let DeliveryDateMax = OrderLine[i].getElementsByTagName({
                tagName: 'DeliveryDateMax'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_deliverydatemax = DeliveryDateMax;
            let DeliveryDateMin = OrderLine[i].getElementsByTagName({
                tagName: 'DeliveryDateMin'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_deliverydatemin = DeliveryDateMin;
            let HasClaim = OrderLine[i].getElementsByTagName({
                tagName: 'HasClaim'
            })[0].textContent;
            OrderLineObj.HasClaim = HasClaim;
            let InitialPrice = OrderLine[i].getElementsByTagName({
                tagName: 'InitialPrice'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_initialprice = InitialPrice;
            let IsCDAV = OrderLine[i].getElementsByTagName({
                tagName: 'IsCDAV'
            })[0].textContent;
            OrderLineObj.IsCDAV = IsCDAV;
            let IsNegotiated = OrderLine[i].getElementsByTagName({
                tagName: 'IsNegotiated'
            })[0].textContent;
            OrderLineObj.IsNegotiated = IsNegotiated;
            let IsProductEanGenerated = OrderLine[i].getElementsByTagName({
                tagName: 'IsProductEanGenerated'
            })[0].textContent;
            OrderLineObj.IsProductEanGenerated = IsProductEanGenerated;
            let Name = OrderLine[i].getElementsByTagName({
                tagName: 'Name'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_name = Name;
            let OrderLineChildList = OrderLine[i].getElementsByTagName({
                tagName: 'OrderLineChildList'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_orderlinechildlist = OrderLineChildList;
            let ProductCondition = OrderLine[i].getElementsByTagName({
                tagName: 'ProductCondition'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_productcondition = ProductCondition;
            let ProductEan = OrderLine[i].getElementsByTagName({
                tagName: 'ProductEan'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_productean = ProductEan;
            let ProductId = OrderLine[i].getElementsByTagName({
                tagName: 'ProductId'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_productid = ProductId;
            let PurchasePrice = OrderLine[i].getElementsByTagName({
                tagName: 'PurchasePrice'
            })[0].textContent;
            OrderLineObj.custrecord_item_cd_purchaseprice = PurchasePrice;
            let PurchasePriceTaxes = OrderLine[i].getElementsByTagName({
                tagName: 'PurchasePriceTaxes'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_purchasepricetaxes = PurchasePriceTaxes;
            let Quantity = OrderLine[i].getElementsByTagName({
                tagName: 'Quantity'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_quantity = Quantity;
            let RefundShippingCharges = OrderLine[i].getElementsByTagName({
                tagName: 'RefundShippingCharges'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_refundshippingcharges = RefundShippingCharges;
            let RowId = OrderLine[i].getElementsByTagName({
                tagName: 'RowId'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_rowid = RowId;
            let SellerProductId = OrderLine[i].getElementsByTagName({
                tagName: 'SellerProductId'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_sellerproductid = SellerProductId;
            let SellingPrice = OrderLine[i].getElementsByTagName({
                tagName: 'SellingPrice'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_sellingprice = SellingPrice;
            let ShippingDateMax = OrderLine[i].getElementsByTagName({
                tagName: 'ShippingDateMax'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_shippingdatemax = ShippingDateMax;
            let ShippingDateMin = OrderLine[i].getElementsByTagName({
                tagName: 'ShippingDateMin'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_shippingdatemin = ShippingDateMin;
            let Sku = OrderLine[i].getElementsByTagName({
                tagName: 'Sku'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_sku = Sku;
            let SkuParent = OrderLine[i].getElementsByTagName({
                tagName: 'SkuParent'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_skuparent = SkuParent;
            let SupplyMode = OrderLine[i].getElementsByTagName({
                tagName: 'SupplyMode'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_supplymode = SupplyMode;
            let UnitAdditionalShippingCharges = OrderLine[i].getElementsByTagName({
                tagName: 'UnitAdditionalShippingCharges'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_unitadditionalshippin = UnitAdditionalShippingCharges;
            let UnitShippingCharges = OrderLine[i].getElementsByTagName({
                tagName: 'UnitShippingCharges'
            })[0].textContent;
            OrderLineObj.custrecord_cd_item_unitshippingcharges = UnitShippingCharges;
            OrderLineListObj[OrderLineListObj.length] = OrderLineObj;
        }
        orderObj['OrderLineList'] = OrderLineListObj;

        let OrderNumber = order.getElementsByTagName({
            tagName: 'OrderNumber'
        })[0].textContent;
        orderObj.custrecord_cd_ordernumber = OrderNumber;
        let OrderState = order.getElementsByTagName({
            tagName: 'OrderState'
        })[0].textContent;
        orderObj.custrecord_cd_orderstate = OrderState;
        let ParcelList = order.getElementsByTagName({
            tagName: 'ParcelList'
        })[0].textContent;
        orderObj.custrecord_cd_parcellist = ParcelList;
        let PartnerOrderRef = order.getElementsByTagName({
            tagName: 'PartnerOrderRef'
        })[0].textContent;
        orderObj.custrecord_cd_partnerorderref = PartnerOrderRef;
        let PaymentMethod = order.getElementsByTagName({
            tagName: 'PaymentMethod'
        })[0].textContent;
        orderObj.custrecord_cd_paymentmethod = PaymentMethod;
        let SellingTotalAmount = order.getElementsByTagName({
            tagName: 'SellingTotalAmount'
        })[0].textContent;
        orderObj.custrecord_cd_sellingtotalamount = SellingTotalAmount;
        let ShippedTotalAmount = order.getElementsByTagName({
            tagName: 'ShippedTotalAmount'
        })[0].textContent;
        orderObj.custrecord_cd_shippedtotalamount = ShippedTotalAmount;
        let ShippedTotalShippingCharges = order.getElementsByTagName({
            tagName: 'ShippedTotalShippingCharges'
        })[0].textContent;
        orderObj.custrecord_cd_shippedtotalshippingcharge = ShippedTotalShippingCharges;

        //================================================================ShippingAddress
        let ShippingAddressObj = {};
        let ShippingAddress = order.getElementsByTagName({
            tagName: 'ShippingAddress'
        })[0];
        let ShippingAddressAddress1 = ShippingAddress.getElementsByTagName({
            tagName: 'Address1'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_address1 = ShippingAddressAddress1;
        let ShippingAddressAddress2 = ShippingAddress.getElementsByTagName({
            tagName: 'Address2'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_address2 = ShippingAddressAddress2;
        let ShippingAddressApartmentNumber = ShippingAddress.getElementsByTagName({
            tagName: 'ApartmentNumber'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_apartmentnumber = ShippingAddressApartmentNumber;
        let ShippingAddressBuilding = ShippingAddress.getElementsByTagName({
            tagName: 'Building'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_building = ShippingAddressBuilding;
        let ShippingAddressCity = ShippingAddress.getElementsByTagName({
            tagName: 'City'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_city = ShippingAddressCity;
        let ShippingAddressCivility = ShippingAddress.getElementsByTagName({
            tagName: 'Civility'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_civility = ShippingAddressCivility;
        let ShippingAddressCompanyName = ShippingAddress.getElementsByTagName({
            tagName: 'CompanyName'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_companyname = ShippingAddressCompanyName;
        let ShippingAddressCountry = ShippingAddress.getElementsByTagName({
            tagName: 'Country'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_country = ShippingAddressCountry;
        let ShippingAddressCounty = ShippingAddress.getElementsByTagName({
            tagName: 'County'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_county = ShippingAddressCounty;
        let ShippingAddressFirstName = ShippingAddress.getElementsByTagName({
            tagName: 'FirstName'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_firstname = ShippingAddressFirstName;
        let ShippingAddressInstructions = ShippingAddress.getElementsByTagName({
            tagName: 'Instructions'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_instructions = ShippingAddressInstructions;
        let ShippingAddressLastName = ShippingAddress.getElementsByTagName({
            tagName: 'LastName'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_lastname = ShippingAddressLastName;
        let ShippingAddressLatitude = ShippingAddress.getElementsByTagName({
            tagName: 'Latitude'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_latitude = ShippingAddressLatitude;
        let ShippingAddressLongitude = ShippingAddress.getElementsByTagName({
            tagName: 'Longitude'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_longitude = ShippingAddressLongitude;
        let ShippingAddressPlaceName = ShippingAddress.getElementsByTagName({
            tagName: 'PlaceName'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_placename = ShippingAddressPlaceName;
        let ShippingAddressRelayId = ShippingAddress.getElementsByTagName({
            tagName: 'RelayId'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_relayid = ShippingAddressRelayId;
        let ShippingAddressStreet = ShippingAddress.getElementsByTagName({
            tagName: 'Street'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_street = ShippingAddressStreet;
        let ShippingAddressZipCode = ShippingAddress.getElementsByTagName({
            tagName: 'ZipCode'
        })[0].textContent;
        ShippingAddressObj.custrecord_cd_shipping_zipcode = ShippingAddressZipCode;
        orderObj['ShippingAddress'] = ShippingAddressObj;

        let ShippingCode = order.getElementsByTagName({
            tagName: 'ShippingCode'
        })[0].textContent;
        orderObj.custrecord_cd_shippingcode = ShippingCode;
        let ShippingDateMax = order.getElementsByTagName({
            tagName: 'ShippingDateMax'
        })[0].textContent;
        orderObj.custrecord_cd_shippingdatemax = ShippingDateMax;
        let ShippingDateMin = order.getElementsByTagName({
            tagName: 'ShippingDateMin'
        })[0].textContent;
        orderObj.custrecord_cd_shippingdatemin = ShippingDateMin;
        let SiteCommissionPromisedAmount = order.getElementsByTagName({
            tagName: 'SiteCommissionPromisedAmount'
        })[0].textContent;
        orderObj.custrecord_cd_sitecommissionpromisedamou = SiteCommissionPromisedAmount;
        let SiteCommissionShippedAmount = order.getElementsByTagName({
            tagName: 'SiteCommissionShippedAmount'
        })[0].textContent;
        orderObj.custrecord_cd_sitecommissionshippedamoun = SiteCommissionShippedAmount;
        let SiteCommissionValidatedAmount = order.getElementsByTagName({
            tagName: 'SiteCommissionValidatedAmount'
        })[0].textContent;
        orderObj.custrecord_cd_sitecommissionvalidatedamo = SiteCommissionValidatedAmount;
        let Status = order.getElementsByTagName({
            tagName: 'Status'
        })[0].textContent;
        orderObj.custrecord_cd_status = Status;
        let ValidatedTotalAmount = order.getElementsByTagName({
            tagName: 'ValidatedTotalAmount'
        })[0].textContent;
        orderObj.custrecord_cd_validatedtotalamount = ValidatedTotalAmount;
        let ValidatedTotalShippingCharges = order.getElementsByTagName({
            tagName: 'ValidatedTotalShippingCharges'
        })[0].textContent;
        orderObj.custrecord_cd_validatedtotalshippingchar = ValidatedTotalShippingCharges;
        let ValidationStatus = order.getElementsByTagName({
            tagName: 'ValidationStatus'
        })[0].textContent;
        orderObj.custrecord_cd_validationstatus = ValidationStatus;
        let VisaCegid = order.getElementsByTagName({
            tagName: 'VisaCegid'
        })[0].textContent;
        orderObj.custrecord_cd_visacegid = VisaCegid;

        //==============================================================VoucherList
        let VoucherListObj = [];
        let VoucherList = order.getElementsByTagName({
            tagName: 'VoucherList'
        })[0];
        let Voucher = VoucherList.getElementsByTagName({
            tagName: 'Voucher'
        });
        for(let i = 0 ; i < Voucher.length; i ++){
            let VoucherObj = {};
            let CreateDate = Voucher[i].getElementsByTagName({
                tagName: 'CreateDate'
            })[0].textContent;
            VoucherObj.CreateDate = CreateDate;
            let Source = Voucher[i].getElementsByTagName({
                tagName: 'Source'
            })[0].textContent;
            VoucherObj.Source = Source;

            let RefundInformationObj = {};
            let RefundInformation = Voucher[i].getElementsByTagName({
                tagName: 'RefundInformation'
            })[0];
            let Amount = RefundInformation.getElementsByTagName({
                tagName: 'Amount'
            })[0].textContent;
            RefundInformationObj.Amount = Amount;
            let MotiveId = RefundInformation.getElementsByTagName({
                tagName: 'MotiveId'
            })[0].textContent;
            RefundInformationObj.MotiveId = MotiveId;
            VoucherObj['RefundInformation'] = RefundInformationObj;
            VoucherListObj[VoucherListObj.length] = VoucherObj;
        }
        orderObj['VoucherList'] = VoucherListObj;
        log.debug(OrderNumber, orderObj);
        return orderObj;
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});
