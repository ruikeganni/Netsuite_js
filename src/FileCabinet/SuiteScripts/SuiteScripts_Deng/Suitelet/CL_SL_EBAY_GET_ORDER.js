/**
* @NApiVersion 2.1
* @NScriptType Suitelet
*/
define(['N/record', 'N/search', 'N/https', 'N/runtime', 'N/file', '../util/PLATFORM_UTIL_REQUEST', '../util/PLATFORM_UTIL_METHOD'], 
function(record, search, https, runtime, file, requestUtil, methodUtil) {

    const ebayPlatform = 5;

    const orderType = 1;  //接口类型Order

    function onRequest(context) {
        try{
            var order_id = runtime.getCurrentScript().getParameter({ name: 'custscript_ebay_order_id' });
            if(!order_id){
                throw new Error('请输入参数order_id!');
            }
            var stores = methodUtil.getStoreList();
            var value = stores[0];
            log.debug('store', value);
            var url = 'https://api.ebay.com/sell/fulfillment/v1/order/'+order_id;
            var response = getOrdes(url, value);
            if(response.body && response.body.indexOf('token') != -1){
                var token = requestUtil.ebayAuth(value);
                if(token){
                    value.token = token;
                    response = getOrdes(url,value);
                }
            }
            log.debug('response', response);
            if(response.code == 200){
                var field_id = methodUtil.createFile('Ebay_Order_', value, response, 610, ebayPlatform, orderType);
                if(field_id){
                    var fileRec = record.load({
                        type: 'customrecord_file_analysis_list',
                        id: field_id
                    });
                    var orderFile = file.load({
                        id: fileRec.getValue('custrecord_file_url')
                    }).getContents();
                    var response = JSON.parse(orderFile);
                    
                    var orderIds = [];
                    var order = response;
                    orderIds[orderIds.length] = order.orderId;
                    var searchOrderObj = searchOrder(orderIds);
                    
                    var orderList = [];
                    var orderObj = parseOrder(order, fileRec);
                    orderList[orderList.length] = orderObj;

                    for(var order in orderList){
                        var recId = createOrder(orderList[order], searchOrderObj);
                        log.debug('Ebay: 订单内部标识',recId);
                        createOrderItem(recId, orderList[order]['itemLines']);
                    }
                    record.submitFields({
                        type:'customrecord_file_analysis_list',
                        id: field_id,
                        values:{
                            'custrecordanalysis_status': true
                        }
                    });
                }
            }
        }catch(e){
            log.debug('error', e.message + ';' + e.stack);
        }
    }

    /**
     * 
     * @param {*} value 店铺账号
     * @returns 
     */
    function getOrdes(url,value){
        var headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer '+value.token,
            'Accept': 'application/json',
            'Accept-Encoding': 'application/gzip'
        };
        return requestUtil.request(url, headers, null, https.Method.GET);
    }

    /**
     * 搜索Ebay: 订单
     * @param {*} orderIds orderId[]
     * @returns 
     */
    function searchOrder(orderIds){
        var filters = [];
        for(var i in orderIds){
            if(i == 0){
                filters[filters.length] = ['custrecord_ebay_order_id','is',orderIds[i]];
            }else{
                filters[filters.length] = 'OR';
                filters[filters.length] = ['custrecord_ebay_order_id','is',orderIds[i]];
            }
        }
        var searchOrderObj = {};
        var searchOrder = search.create({
            type: 'customrecord_ebay_order',
            filters: filters,
            columns: ['custrecord_ebay_order_id']
        });
        searchOrder.run().each(function(result){
            searchOrderObj[result.getValue('custrecord_ebay_order_id')] = result.id;
            return true;
        });
        return searchOrderObj;
    }

    /**
     * 创建Ebay: 订单记录
     * @param {*} order 
     * @param {*} fileRec 
     * @returns 
     */
    function createOrder(order, searchOrderObj){
        var nsId = searchOrderObj[order['custrecord_ebay_order_id']];
        var rec;
        if(nsId){
            log.debug('load',nsId);
            rec = record.load({
                type: 'customrecord_ebay_order',
                id: nsId
            });
        }else{
            log.debug('create',order['custrecord_ebay_order_id']);
            rec = record.create({
                type: 'customrecord_ebay_order'
            });
        }
        for(var key in order){
            rec.setValue(key,order[key]);
        }
        rec.setValue('custrecord_ebay_order_return_download', false);
        rec.setValue('externalId','Ebay_Order_'+order['custrecord_ebay_order_id']);
        rec.setValue('name',order['custrecord_ebay_order_id']);
        return rec.save();
    }

    /**
     * 创建Ebay: 订单明细记录
     * @param {*} recId 
     * @param {*} itemLines 
     */
    function createOrderItem(recId,itemLines){
        var orderLineObj = searchOrderLine(recId);
        for(var itemKey in itemLines){
            var nsId = orderLineObj[recId+'{}'+itemLines[itemKey]['custrecord_ebay_item_lineitemid']];
            var rec;
            if(nsId){
                rec = record.load({
                    type: 'customrecord_ebay_order_item',
                    id: nsId
                });
            }else{
                rec = record.create({
                    type: 'customrecord_ebay_order_item'
                });
            }
            var item = itemLines[itemKey];
            for(var key in item){
                rec.setValue(key, item[key]);
            }
            rec.setValue('custrecord_ebay_item_order',recId);
            var itemRecId = rec.save();
            log.debug('Ebay: 订单明细内部标识',recId+'{}'+itemRecId);
        }
    }

    /**
     * 根据订单ID搜索出订单
     * @param {*} recId Ebay: 订单ID
     * @returns 
     */
    function searchOrderLine(recId){
        var orderLineObj = {};
        var orderLineSearch = search.create({
            type: 'customrecord_ebay_order_item',
            filters: ['custrecord_ebay_item_order','is',recId],
            columns: ['custrecord_ebay_item_order','custrecord_ebay_item_lineitemid']
        });
        orderLineSearch.run().each(function(result){
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
    function parseOrder(order, fileRec){
        var orderObj = {};
        orderObj.custrecord_ebay_order_id = order.orderId;
        orderObj.custrecord_ebay_legacy_order_id = order.legacyOrderId;
        orderObj.custrecord_ebay_creation_date = order.creationDate;
        orderObj.custrecord_ebay_last_modified_date = order.lastModifiedDate;
        orderObj.custrecord_ebay_order_fulfillment_status = order.orderFulfillmentStatus;
        orderObj.custrecord_ebay_order_payment_status = order.orderPaymentStatus;
        orderObj.custrecord_ebay_seller_id = order.sellerId;

        orderObj.custrecord_ebay_buyer_username = order.buyer.username;
        orderObj.custrecord_ebay_buyer_taxaddress_postal = order.buyer.taxAddress.postalCode;
        orderObj.custrecord_ebay_buyer_taxaddress_country = order.buyer.taxAddress.countryCode;
        orderObj.custrecord_ebaybuyer_taxaddress_state = order.buyer.taxAddress.stateOrProvince;
        orderObj.custrecord_ebay_buyer_taxaddress_city = order.buyer.taxAddress.city;

        if(order.taxIdentifier){
            orderObj.custrecord_ebaybuyer_ti_taxpayerid = order.taxIdentifier.taxpayerId;
            orderObj.custrecord_ebay_buyer_ti_taxidentifierty = order.taxIdentifier.taxIdentifierType;
            orderObj.custrecord_ebay_buyer_ti_issuingcountry = order.taxIdentifier.issuingCountry;
        }

        if(order.cancelStatus){
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
        if(order.totalFeeBasisAmount){
        orderObj.custrecord_ebay_total_fee_basis_amount = order.totalFeeBasisAmount.value;
        orderObj.custrecord_ebay_total_fee_basis_amount_c = order.totalFeeBasisAmount.currency;
        }
        if(order.totalMarketplaceFee){
        orderObj.custrecord_ebay_total_marketplace_fee = order.totalMarketplaceFee.value;
        orderObj.custrecord_ebay_total_marketplace_fee_cr = order.totalMarketplaceFee.currency;
        }
        
        
        orderObj.custrecord_ebay_ns_status = 'PLATFORM_ORDER'; //NS状态
        orderObj.custrecord_ebay_store = fileRec.getValue('custrecord_seller_dev_1');  //店铺账号
        // orderObj.custrecord_ebay_order_json = JSON.stringify(order);  //订单JSON
        orderObj.custrecord_ebay_order_file_parse_list = fileRec.id;
        if(order.pricingSummary){
            if(order.pricingSummary.priceSubtotal){
                orderObj.custrecord_ebay_pricingsummary_ps_value = order.pricingSummary.priceSubtotal.value;
                orderObj.custrecord_ebay_pricingsummary_ps_curren = order.pricingSummary.priceSubtotal.currency;    
            }
            if(order.pricingSummary.priceDiscount){
                orderObj.custrecord_ebay_pricingsummary_pd = order.pricingSummary.priceDiscount.value;
                orderObj.custrecord_ebay_pricingsummary_pd_curren = order.pricingSummary.priceDiscount.currency;
            }
            if(order.pricingSummary.deliveryCost){
                orderObj.custrecord_ebay_pricingsummary_dc = order.pricingSummary.deliveryCost.value;
                orderObj.custrecord_ebay_pricingsummary_dc_curren = order.pricingSummary.deliveryCost.currency;
            }
            if(order.pricingSummary.total){
                orderObj.custrecord_ebay_pricingsummary_total = order.pricingSummary.total.value;
                orderObj.custrecord_ebay_pricingsummary_total_cur = order.pricingSummary.total.currency;
            }
        }
        var itemLine = [];
        for(var key in order.lineItems){
            var item = order.lineItems[key];
            var itemObj = {};
            itemObj.name = order.orderId +','+ item.lineItemId;
            itemObj.custrecord_ebay_item_lineitemid = item.lineItemId;
            itemObj.custrecord_ebay_item_legacyitemid = item.legacyItemId;
            itemObj.custrecord_ebay_item_sku = item.sku;
            itemObj.custrecord_ebay_item_title = item.title;
            if(item.lineItemCost){
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
            if(item.total){
                itemObj.custrecord_ebay_total = item.total.value;
                itemObj.custrecord_ebay_item_total_currency = item.total.currency;
            }
            
            if(item.deliveryCost && item.deliveryCost.shippingCost){
                itemObj.custrecord_ebay_item_dc_shippingcost = item.deliveryCost.shippingCost.value;
                itemObj.custrecord_ebay_item_dc_shippingcost_cur = item.deliveryCost.shippingCost.currency;
            }
            
            itemObj.custrecord_ebay_item_appliedpromotions = JSON.stringify(item.appliedPromotions);
            itemObj.custrecord_ebay_item_taxes = JSON.stringify(item.taxes);
            itemObj.custrecord_ebay_item_properties = JSON.stringify(item.properties);
            itemObj.custrecord_ebay_item_fulfillmentinstruct = JSON.stringify(item.lineItemFulfillmentInstructions);
            itemObj.custrecord_ebay_item_itemlocation = item.itemLocation.location;
            itemObj.custrecord_ebay_item_il_countrycode = item.itemLocation.countryCode;
            itemObj.custrecord_ebay_il_postalcode = item.itemLocation.postalCode;
            itemObj.custrecord_ebay_item_ns_status = 'PLATFORM_ORDER';
            itemLine[itemLine.length] = itemObj;
        }
        orderObj['itemLines'] = itemLine;
        return orderObj;
    }

    return {
        onRequest: onRequest
    }
});
