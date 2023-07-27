/**
 * 根据Ebay: 订单记录抓取退货数据
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', 'N/search', 'N/https', './util/PLATFORM_UTIL_REQUEST', './util/PLATFORM_UTIL_METHOD'], 
(record, search, https, requestUtil, methodUtil) => {

    const ebayPlatform = 5;
    const returnType = 3;  //接口类型Retuen

    let url = 'https://api.ebay.com/post-order/v2/return/search?order_id=';

    const getInputData = () => {
        return methodUtil.getStoreList();
    }

    const map = (context) => {
        try{
            let value = JSON.parse(context.value);
            context.write(value, getOrderList(value));
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const reduce = (context) => {
        try{
            log.debug('context', context);
            let store = JSON.parse(context.key);
            let orderList = JSON.parse(context.values[0]);
            let headers = {
                'Authorization': 'TOKEN '+store.token,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            for(let key in orderList) {
                let order = orderList[key];
                url = url + order.orderId;
                let response = requestUtil.request(url, headers, null, https.Method.GET);
                log.debug('orderId',order.orderId);
                if(response.code == 200){
                    let body = JSON.parse(response.body);
                    if(body.total > 0){
                        methodUtil.createFile('Ebay_Return_', store, response, 612, ebayPlatform, returnType);
                    }
                    record.submitFields({
                        type:'customrecord_ebay_order',
                        id: order.id,
                        values:{
                            'custrecord_ebay_order_return_download': true
                        }
                    });
                }
            }
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const summarize = (summary) => {
        log.debug('', 'end');
    }

    const getOrderList = (store) => {
        let orderList = [];
        search.create({
            type: 'customrecord_ebay_order',
            filters: [
                ['custrecord_ebay_store', 'is', store.id], 'AND',
                ['custrecord_ebay_order_return_download', 'is', false]
            ],
            columns: ['custrecord_ebay_order_id']
        }).run().each(function(result) {
            let order = {
                id: result.id,
                orderId: result.getValue('custrecord_ebay_order_id')
            };
            orderList[orderList.length] = order;
            if(orderList.length < 20){
                return true;
            }
        });
        return orderList;
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});
