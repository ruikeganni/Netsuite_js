/**
 * Ebay订单文件解析
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', 'N/search', 'N/file'], 
(record, search, file) => {

    const ebayPlatform = 5;
    const orderType = 1;

    const getInputData = () => {
        return getParseFileList();
    }

    const map = (context) => {
        try{
            let value = JSON.parse(context.value);
            log.debug('value', value);
            let fileRec = record.load({
                type: 'customrecord_file_analysis_list',
                id: value.id
            });
            let orderFile = file.load(fileRec.getValue('custrecord_file_url')).getContents();

            let response = JSON.parse(orderFile);
            let orderList = response.orders;
            let orderIds = orderList.map(o => o.orderId);
            log.debug('orderIds', orderIds);
            let searchOrderObj = searchOrder(orderIds);
            let orderObjList = [];
            for(let order in orderList) {
                orderObjList[order] = parseOrder(orderList[order], fileRec);;
            }
            context.write({
                key: value.id,
                value: {
                    searchOrderObj: searchOrderObj,
                    orderList: orderObjList
                }
            });
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const reduce = (context) => {
        try{
            let val = JSON.parse(context.values[0]);
            let orderList = val.orderList;
            let searchOrderObj = val.searchOrderObj;
            for(let order in orderList) {
                let recId = createOrder(orderList[order], searchOrderObj);
                log.debug('Ebay: 订单内部标识', recId);
                createOrderItem(recId, orderList[order]['itemLines']);
            }
            record.submitFields({
                type: 'customrecord_file_analysis_list',
                id: context.key,
                values:{
                    custrecordanalysis_status: true
                }
            });
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const summarize = (summary) => {
        log.debug('', 'end');
    }

    /**
     * 搜索Ebay: 订单
     * @param {*} orderIds orderId[]
     * @returns 
     */
    const searchOrder = (orderIds) => {
        let filters = [];
        for(let i in orderIds) {
            if(i == 0) {
                filters[filters.length] = ['custrecord_ebay_order_id', 'is', orderIds[i]];
            }else {
                filters[filters.length] = 'OR';
                filters[filters.length] = ['custrecord_ebay_order_id', 'is', orderIds[i]];
            }
        }
        let searchOrderObj = {};
        search.create({
            type: 'customrecord_ebay_order',
            filters: filters,
            columns: ['custrecord_ebay_order_id']
        }).run().each(function(result) {
            searchOrderObj[result.getValue('custrecord_ebay_order_id')] = result.id;
            return true;
        });
        return searchOrderObj;
    }

    /**
     * 创建Ebay: 订单明细记录
     * @param {*} recId 
     * @param {*} itemLines 
     */
    const createOrderItem = (recId, itemLines) => {
        let orderLineObj = searchOrderLine(recId);
        for(let itemKey in itemLines){
            let nsId = orderLineObj[recId+'{}'+itemLines[itemKey]['custrecord_ebay_item_lineitemid']];
            let rec = nsId?record.load({
                type: 'customrecord_ebay_order_item',
                id: nsId
            }):record.create({
                type: 'customrecord_ebay_order_item'
            });
            let item = itemLines[itemKey];
            for(let key in item) {
                rec.setValue(key, item[key]);
            }
            rec.setValue('custrecord_ebay_item_order', recId);
            let itemRecId = rec.save();
            log.debug('Ebay: 订单明细内部标识', recId+'{}'+itemRecId);
        }
    }

    /**
     * 创建Ebay: 订单记录
     * @param {*} order 
     * @param {*} fileRec 
     * @returns 
     */
    const createOrder = (order, searchOrderObj) => {
        let nsId = searchOrderObj[order['custrecord_ebay_order_id']];
        let rec = nsId?record.load({
            type: 'customrecord_ebay_order',
            id: nsId
        }):record.create({
            type: 'customrecord_ebay_order'
        });
        log.debug(nsId?'load':'create', order['custrecord_ebay_order_id']);
        for(let key in order) {
            rec.setValue(key, order[key]);
        }
        rec.setValue('custrecord_ebay_order_return_download', false);
        rec.setValue('externalId', 'Ebay_Order_'+order['custrecord_ebay_order_id']);
        rec.setValue('name', order['custrecord_ebay_order_id']);
        return rec.save();
    }

    /**
     * 根据订单ID搜索出订单
     * @param {*} recId Ebay: 订单ID
     * @returns 
     */
    const searchOrderLine = (recId) => {
        let orderLineObj = {};
        search.create({
            type: 'customrecord_ebay_order_item',
            filters: ['custrecord_ebay_item_order', 'is', recId],
            columns: ['custrecord_ebay_item_order', 'custrecord_ebay_item_lineitemid']
        }).run().each(function(result) {
            orderLineObj[result.getValue('custrecord_ebay_item_order')+'{}'+result.getValue('custrecord_ebay_item_lineitemid')] = result.id;
            return true;
        });
        return orderLineObj;
    }

    /**
     * 解析Ebay订单
     * @param {*} order 订单
     * @param {*} fileRec 文件解析列表
     */
    const parseOrder = (order, fileRec) => {
        let orderObj = {};
        orderObj.custrecord_ebay_order_id = order.orderId;
        orderObj.custrecord_ebay_legacy_order_id = order.legacyOrderId;
        orderObj.custrecord_ebay_creation_date = order.creationDate;
        orderObj.custrecord_ebay_last_modified_date = order.lastModifiedDate;
        orderObj.custrecord_ebay_order_fulfillment_status = order.orderFulfillmentStatus;
        orderObj.custrecord_ebay_order_payment_status = order.orderPaymentStatus;
        orderObj.custrecord_ebay_seller_id = order.sellerId;

        orderObj.custrecord_ebay_buyer_username = order.buyer.username;
        if(order.buyer.taxAddress) {
            orderObj.custrecord_ebay_buyer_taxaddress_postal = order.buyer.taxAddress.postalCode;
            orderObj.custrecord_ebay_buyer_taxaddress_country = order.buyer.taxAddress.countryCode;
            orderObj.custrecord_ebaybuyer_taxaddress_state = order.buyer.taxAddress.stateOrProvince;
            orderObj.custrecord_ebay_buyer_taxaddress_city = order.buyer.taxAddress.city;
        }

        if(order.taxIdentifier) {
            orderObj.custrecord_ebaybuyer_ti_taxpayerid = order.taxIdentifier.taxpayerId;
            orderObj.custrecord_ebay_buyer_ti_taxidentifierty = order.taxIdentifier.taxIdentifierType;
            orderObj.custrecord_ebay_buyer_ti_issuingcountry = order.taxIdentifier.issuingCountry;
        }

        if(order.cancelStatus) {
            orderObj.custrecord_ebay_cancelstate = order.cancelStatus.cancelState;
            orderObj.custrecord_ebay_cancelstatus_request = order.cancelStatus.cancelRequests;
        }
        
        orderObj.custrecord_ebay_paymentsummary_tds = order.paymentSummary.totalDueSeller.value;
        orderObj.custrecord_ebay_paymentsummary_tds_curre = order.paymentSummary.totalDueSeller.currency;
        orderObj.custrecord_ebay_paymentsummary_refunds = JSON.stringify(order.paymentSummary.refunds);
        orderObj.custrecord_ebay_paymentsummary_payments = JSON.stringify(order.paymentSummary.payments);
        orderObj.custrecord_ebay_fulfillmentstartinstruct = JSON.stringify(order.fulfillmentStartInstructions);
        orderObj.custrecord_ebay_fulfillmenthrefs = JSON.stringify(order.fulfillmentHrefs);
        orderObj.custrecord_ebay_salesrecordreference = order.salesRecordReference;
        orderObj.custrecord_ebay_total_fee_basis_amount = order.totalFeeBasisAmount.value;
        orderObj.custrecord_ebay_total_fee_basis_amount_c = order.totalFeeBasisAmount.currency;
        if(order.totalMarketplaceFee) {
            orderObj.custrecord_ebay_total_marketplace_fee = order.totalMarketplaceFee.value;
            orderObj.custrecord_ebay_total_marketplace_fee_cr = order.totalMarketplaceFee.currency;
        }
        
        if(order.fulfillmentStartInstructions && order.fulfillmentStartInstructions.length > 0) {
            let shipAdd = order.fulfillmentStartInstructions[0].shippingStep.shipTo;
            if(shipAdd) {
                orderObj.custrecord_ebay_fullname = shipAdd.fullName;
                if(shipAdd.contactAddress) {
                    orderObj.custrecordebay_addressline1 = shipAdd.contactAddress.addressLine1;
                    orderObj.custrecord_ebay_postalcode = shipAdd.contactAddress.postalCode;
                    orderObj.custrecord_ebay_countrycode = shipAdd.contactAddress.countryCode;
                    orderObj.custrecord_ebay_stateorprovince = shipAdd.contactAddress.stateOrProvince;
                    orderObj.custrecord_ebay_addressline2 = shipAdd.contactAddress.addressLine2;
                    orderObj.custrecord_ebay_city = shipAdd.contactAddress.city;
                }
                if(shipAdd.primaryPhone) {
                    orderObj.custrecord_ebay_phonenumber = shipAdd.primaryPhone.phoneNumber;
                }
                orderObj.custrecord_ebay_email = shipAdd.email;
            }
        }
        
        orderObj.custrecord_ebay_ns_status = 'PLATFORM_ORDER'; //NS状态
        orderObj.custrecord_ebay_store = fileRec.getValue('custrecord_seller_dev_1');  //店铺账号
        orderObj.custrecord_ebay_order_file_parse_list = fileRec.id;
        if(order.pricingSummary) {
            if(order.pricingSummary.priceSubtotal) {
                orderObj.custrecord_ebay_pricingsummary_ps_value = order.pricingSummary.priceSubtotal.value;
                orderObj.custrecord_ebay_pricingsummary_ps_curren = order.pricingSummary.priceSubtotal.currency;    
            }
            if(order.pricingSummary.priceDiscount) {
                orderObj.custrecord_ebay_pricingsummary_pd = order.pricingSummary.priceDiscount.value;
                orderObj.custrecord_ebay_pricingsummary_pd_curren = order.pricingSummary.priceDiscount.currency;
            }
            if(order.pricingSummary.deliveryCost) {
                orderObj.custrecord_ebay_pricingsummary_dc = order.pricingSummary.deliveryCost.value;
                orderObj.custrecord_ebay_pricingsummary_dc_curren = order.pricingSummary.deliveryCost.currency;
            }
            if(order.pricingSummary.total) {
                orderObj.custrecord_ebay_pricingsummary_total = order.pricingSummary.total.value;
                orderObj.custrecord_ebay_pricingsummary_total_cur = order.pricingSummary.total.currency;
            }
        }
        let itemLine = [];
        for(let key in order.lineItems) {
            let item = order.lineItems[key];
            let itemObj = {};
            itemObj.name = order.orderId +','+ item.lineItemId;
            itemObj.custrecord_ebay_item_lineitemid = item.lineItemId;
            itemObj.custrecord_ebay_item_legacyitemid = item.legacyItemId;
            itemObj.custrecord_ebay_item_sku = item.sku;
            itemObj.custrecord_ebay_item_title = item.title;
            if(item.lineItemCost) {
                itemObj.custrecord_ebay_item_lineitemcost = item.lineItemCost.value;
                itemObj.custrecord_ebay_item_lineitemcost_curren = item.lineItemCost.currency;
            }
            itemObj.custrecord_ebay_item_discountedlineitemc;
            itemObj.custrecord_ebay_item_dlic_currency;
            itemObj.custrecord_ebay_item_quantity = item.quantity;
            itemObj.custrecord_ebay_item_soldformat = item.soldFormat;
            itemObj.custrecord_ebay_item_listingmarketplacei = item.listingMarketplaceId;
            itemObj.custrecord_ebay_item_purchasemarketplace = item.purchaseMarketplaceId;
            itemObj.custrecord_ebay_item_lineitemfulfillment = item.lineItemFulfillmentStatus;
            if(item.total) {
                itemObj.custrecord_ebay_total = item.total.value;
                itemObj.custrecord_ebay_item_total_currency = item.total.currency;
            }
            
            if(item.deliveryCost && item.deliveryCost.shippingCost) {
                itemObj.custrecord_ebay_item_dc_shippingcost = item.deliveryCost.shippingCost.value;
                itemObj.custrecord_ebay_item_dc_shippingcost_cur = item.deliveryCost.shippingCost.currency;
            }
            
            itemObj.custrecord_ebay_item_appliedpromotions = JSON.stringify(item.appliedPromotions);
            let discount_amount = 0;
            for(let i = 0; i < item.appliedPromotions.length; i++) {
                let discountAmount = item.appliedPromotions[i].discountAmount;
                discount_amount = discount_amount + Number(discountAmount.value);
            }
            itemObj.custrecord_ebay_discount_amount = discount_amount;
            itemObj.custrecord_ebay_promotionid = item.appliedPromotions&&item.appliedPromotions.length>0?item.appliedPromotions[0].promotionId:'';
            itemObj.custrecord_ebay_description = item.appliedPromotions&&item.appliedPromotions.length>0?item.appliedPromotions[0].description:''; 

            itemObj.custrecord_ebay_item_taxes = JSON.stringify(item.taxes);
            let tax = 0;
            for(let i = 0; i < item.taxes.length; i++) {
                let amount = item.taxes[0].amount;
                tax = tax + Number(amount.value);
            }
            itemObj.custrecord_ebay_tax = tax;

            itemObj.custrecord_ebay_item_properties = JSON.stringify(item.properties);
            itemObj.custrecord_ebay_item_fulfillmentinstruct = JSON.stringify(item.lineItemFulfillmentInstructions);
            if(item.itemLocation) {
                itemObj.custrecord_ebay_item_itemlocation = item.itemLocation.location;
                itemObj.custrecord_ebay_item_il_countrycode = item.itemLocation.countryCode;
                itemObj.custrecord_ebay_il_postalcode = item.itemLocation.postalCode;
            }
            itemObj.custrecord_ebay_item_ns_status = 'PLATFORM_ORDER';
            itemLine[itemLine.length] = itemObj;
        }
        orderObj['itemLines'] = itemLine;
        return orderObj;
    }
    
    /**
     * 搜索未解析文件列表
     * @returns 
     */
    const getParseFileList = () => {
        let allFile = [];
        search.create({
            type: 'customrecord_file_analysis_list',
            filters:
                [
                    ['custrecord_sales_platform', 'is', ebayPlatform],'AND',
                    ['custrecord_data_type', 'is', orderType],'AND',
                    ['custrecordanalysis_status', 'is', false]
                ]
        }).run().each(function(result) {
            allFile[allFile.length] = result;
            if(allFile.length < 10) {
                return true;
            }
        });
        log.debug('allFile', allFile);
        return allFile;
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});