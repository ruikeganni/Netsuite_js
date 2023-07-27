/**
 * eBay创建售后申请单
 *@NApiVersion 2.x
 *@NScriptType MapReduceScript
 */
define(['N/record', './util/moment', 'N/search', './util/PLATFORM_UTIL_METHOD'], 
function(record, moment, search, methodUtil) {

    function getInputData() {
        return getEbayReturnList();
    }

    function map(context) {
        try{
            var returnObj = JSON.parse(context.value);
            var raSearch = search.create({
                type: 'customrecord_hc_mo_return_authorisation',
                filters: [
                    ['custrecord_hc_morma_return_id', 'is', returnObj.returnId]
                ],
                columns: []
            });
            raSearch.run().each(function(result){
                returnObj.internalId = result.id;
            });
            var raObj = toRaObj(returnObj);
            if(raObj){
                raObj.internalId = returnObj.internalId;
                log.debug('order', raObj);
                context.write({
                    key: returnObj.id,
                    value: raObj
                });
            }else{
                log.debug('toRaError', '退货ID【'+returnObj.returnId+'】生成售后申请单失败，订单编号【'+returnObj.orderId+'】未找到商家订单');
            }
        }catch(e){
            log.debug('error', e.message+';'+e.stack);
        }
    }

    function reduce(context) {
        try{
            var order = JSON.parse(context.values[0]);
            var rec;
            if(order.internalId){
                rec = record.load({
                    type: 'customrecord_hc_mo_return_authorisation',
                    id: order.internalId
                });
            }else{
                rec = record.create({
                    type: 'customrecord_hc_mo_return_authorisation'
                });
            }
            for(var key in order){
                if(key == 'internalId'){
                }else if(key == 'custrecord_hc_morma_currency'){
                    rec.setText(key, order[key]);
                }else if(key == 'creationDate'){
                    rec.setValue('custrecord_hc_morma_request_date', moment(order[key]).toDate());
                    rec.setValue('custrecord_hc_morma_create_date', moment(order[key]).toDate());
                }else if(key == 'itemList'){
                    for(var i = 0 ; i < order[key].length; i++){
                        var itemObj = order[key][i];
                        for(var itemKey in itemObj){
                            rec.setSublistValue({
                                sublistId: 'recmachcustrecord_hc_mori_header',
                                fieldId: itemKey,
                                value: itemObj[itemKey],
                                line: i
                            });
                        }
                    }
                }else if(key == 'custrecord_hc_morma_cus_supply'){
                    rec.setValue(key, order[key]);
                    rec.setValue('custrecord_hc_morma_type', '2');
                }else{
                    rec.setValue(key, order[key]);
                }
            }
            var recId = rec.save();
            log.debug('售后申请单内部标识', recId);
            record.submitFields({
                type:'customrecord_ebay_return',
                id: context.key,
                values:{
                    'custrecord_ebay_ra_ns_status': 'CREATE_RA',
                    'custrecord_ebay_return_ra': recId
                }
            });
        }catch(e){
            log.debug('error', e.message + ';' + e.stack);
        }
    }

    function summarize(summary) {
        
    }

    function toRaObj(returnObj){
        var creationinfo = JSON.parse(returnObj.creationinfo);
        log.debug('creationinfo', creationinfo);
        var sellertotalrefund = JSON.parse(returnObj.sellertotalrefund);
        var store = search.lookupFields({
			type: 'customrecord_hc_seller_profile',
			id: returnObj.storeId,
			columns: ['custrecord_hc_sp_customer', 'custrecord_hc_sp_owned_subsidiary']
		});
        var raObj = {};
        raObj.custrecord_hc_morma_return_id = returnObj.returnId;
        // raObj.custrecord_hc_morma_type = 10; //售后类型
        raObj.custrecord_hc_morma_cus_supply = 2; //客供售后
        raObj.custrecord_hc_morma_customer = store.custrecord_hc_sp_customer.length > 0?store.custrecord_hc_sp_customer[0].value:''; //店铺客户
        raObj.custrecord_hc_morma_subsidiary = store.custrecord_hc_sp_owned_subsidiary.length > 0?store.custrecord_hc_sp_owned_subsidiary[0].value:''; //附属公司
        raObj.custrecord_hc_morma_return_reason = creationinfo.comments.content; //售后原因

        if(sellertotalrefund.actualRefundAmount){
            raObj.custrecord_hc_morma_currency = sellertotalrefund.actualRefundAmount.currency;
            raObj.amount = sellertotalrefund.actualRefundAmount.value;
        }else{
            raObj.custrecord_hc_morma_currency = sellertotalrefund.estimatedRefundAmount.currency;
            raObj.amount = sellertotalrefund.estimatedRefundAmount.value;
        }
        raObj.custrecord_hc_morma_rma_id = returnObj.orderId;  //平台订单
        // raObj.custrecord_hc_morma_memo; //备注
        raObj.custrecord_hc_morma_invoice_status = 1; //开票状态
        raObj.creationDate = creationinfo.creationDate.value;
        // raObj.custrecord_hc_morma_request_date; //申请日期
        // raObj.custrecord_hc_morma_create_date; //申请时间
        raObj.custrecord_hc_morma_inventory_status = 1; //退货状态
        raObj.custrecord_hc_morma_refund_status = 1; //退款状态
        raObj.custrecord_hc_morma_request_status = 1; //申请状态

        var soSearch = search.create({
            type: 'customrecord_hc_merchant_order',
            filters: [['custrecord_hc_mo_order_id', 'is', returnObj.orderId]],
            columns: []
        });
        soSearch.run().each(function(result){
            raObj.custrecord_hc_morma_craeted_from = result.id; //来源订单 
        });
        log.debug('商家订单内部标识', raObj.custrecord_hc_morma_craeted_from);

        var itemList = [];
        if(raObj.custrecord_hc_morma_craeted_from){
            var itemObj = {};
            var soItemSearch = search.create({
                type: 'customrecord_hc_merchant_order_line',
                filters: [
                    ['custrecord_hc_mol_merchant_order', 'is', raObj.custrecord_hc_morma_craeted_from]
                    ,'AND',
                    ['custrecord_hc_mol_line_item_id', 'is', creationinfo.item.itemId]
                ],
                columns: ['custrecord_hc_mol_ns_sku']
            });
            soItemSearch.run().each(function(result){
                itemObj.custrecord_hc_mori_sku = result.getValue('custrecord_hc_mol_ns_sku');
                return true;
            });
            itemObj.custrecord_hc_mori_sku_name = creationinfo.item.itemTitle;
            itemObj.custrecord_hc_mori_quantity = creationinfo.item.returnQuantity;
            itemObj.custrecord_hc_mori_unit_price = (Number(raObj.amount)/Number(creationinfo.item.returnQuantity));
            itemObj.custrecord_hc_mori_tax_amount = raObj.amount;
            itemObj.custrecord_hc_mori_order_item_id = creationinfo.item.itemId;
            itemList[itemList.length] = itemObj;
        }else{
            return;
        }
        raObj.itemList = itemList;
        return raObj;

        //Shipping
        // raObj.custrecord_hc_morma_return_to_loaction; //退货仓库
        // raObj.custrecord_hc_morma_country; //国家
        // raObj.custrecord_hc_morma_shipping_name; //发运名称
        // raObj.custrecord_hc_morma_shipping_phone; //发运联系方式
        // raObj.custrecord_hc_morma_shipping_address1; //发运地址
        // raObj.custrecord_hc_morma_shipping_zipcode; //发运邮编
        // raObj.custrecord_hc_morma_shipping_address2; //发运地址二
        // raObj.custrecord_hc_morma_shipping_country; //发运国家
        // raObj.custrecord_hc_morma_shipping_city; //发运城市
        // raObj.custrecord_hc_morma_shipping_state; //发运州/省
        // raObj.custrecord_hc_morma_return_label; //退货运单号
    }

    function getEbayReturnList(){
        // customrecord_ebay_return
        var returnList = [];
        var returnSearch = search.create({
            type: 'customrecord_ebay_return',
            filters: [
                ['custrecord_ebay_ra_state', 'is', 'RETURN_REQUESTED']
                ,'AND',
                ['custrecord_ebay_ra_status', 'is', 'RETURN_REQUESTED']
                ,'AND',
                ['custrecord_ebay_ra_currenttype', 'is', 'MONEY_BACK']
                ,'AND',
                ['custrecord_ebay_ra_ns_status', 'is', 'PLATFORM_ORDER']
            ],
            columns: ['custrecord_ebay_return_id', 'custrecord_ebay_ra_orderid', 'custrecord_ebay_ra_creationinfo', 'custrecord_ebay_ra_store', 'custrecord_ebay_ra_sellertotalrefund']
        });
        returnSearch.run().each(function(result){
            var returnObj = {};
            returnObj.id = result.id;
            returnObj.returnId = result.getValue('custrecord_ebay_return_id');
            returnObj.orderId = result.getValue('custrecord_ebay_ra_orderid');
            returnObj.creationinfo = result.getValue('custrecord_ebay_ra_creationinfo');
            returnObj.storeId = result.getValue('custrecord_ebay_ra_store');
            returnObj.sellertotalrefund = result.getValue('custrecord_ebay_ra_sellertotalrefund');
            returnList[returnList.length] = returnObj;
        });
        log.debug('returnList', returnList);
        return returnList;
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});
