/**
 * Ebay订单抓取
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', 'N/https', './util/PLATFORM_UTIL_REQUEST', './util/PLATFORM_UTIL_METHOD'], 
(record, https, requestUtil, methodUtil) => {

    const orderType = 1;
    const ebayPlatform = 5;

    // let url = 'https://api.ebay.com/sell/fulfillment/v1/order?filter=lastmodifieddate:[${startTime}..${endTime}]&limit=${pageSize}&offset=${pageNumber}';

    const getInputData = () => {
        return methodUtil.getStoreList();
    }

    const map = (context) => {
        try{
            let value = JSON.parse(context.value);
            log.debug('value', value);
            let requestParamRec = requestUtil.getRequestParamObj(value.id, ebayPlatform, orderType);
            if(requestParamRec) {
                let url = 'https://api.ebay.com/sell/fulfillment/v1/order?filter=lastmodifieddate:[${startTime}..${endTime}]&limit=${pageSize}&offset=${pageNumber}';
                url = requestParamRec.getValue('custrecord_next_token')?requestParamRec.getValue('custrecord_next_token'):methodUtil.setUrl(url, requestParamRec);
                log.debug('url', url);
                value.token = !value.token?requestUtil.ebayAuth(value):value.token;
                let response = getOrdes(url, value);
                if(response.body && response.body.indexOf('token') != -1) {
                    let token = requestUtil.ebayAuth(value);
                    if(token){
                        value.token = token;
                        response = getOrdes(url, value);
                    }
                }
                log.debug('response', response);
                if(response.code == 200 && response.body.indexOf('href') != -1) {
                    let body = JSON.parse(response.body);
                    log.debug('订单数量{}', body.total);
                    if(body.total > 0) {
                        methodUtil.createFile('Ebay_Order_', value, response, 610, ebayPlatform, orderType);
                    }
                    if(body.next) {
                        record.submitFields({
                            type: 'customrecord_platform_request_param',
                            id: requestParamRec.id,
                            values: {
                                custrecord_next_token: body.next,
                                custrecord_total_number: body.total
                            }
                        });
                    }else {requestUtil.submitCDRequestParam(requestParamRec, body.total);}
                }else {requestUtil.saveStoreMsg(value.id, response);}
            }else {requestUtil.saveStoreMsg(value.id, '未维护平台接口参数');}
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const reduce = (context) => {
        
    }

    const summarize = (summary) => {
        log.debug('', 'end');
    }

    const getOrdes = (url, value) => {
        let headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer '+value.token,
            'Accept': 'application/json',
            'Accept-Encoding': 'application/gzip'
        };
        return requestUtil.request(url, headers, null, https.Method.GET);
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});
