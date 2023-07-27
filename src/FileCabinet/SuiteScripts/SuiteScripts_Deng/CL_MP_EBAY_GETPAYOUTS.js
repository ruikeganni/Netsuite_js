/**
 * Ebay拉取Payout数据
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', 'N/https', './util/PLATFORM_UTIL_REQUEST', './util/PLATFORM_UTIL_METHOD'], 
(record, https, requestUtil, methodUtil) => {

    const ebayPlatform = 5;
    const paymentType = 2;

    const getInputData = () => {
        return methodUtil.getStoreList();
    }

    const map = (context) => {
        try{
            let value = JSON.parse(context.value);
            log.debug('value',value);
            let requestParamRec = requestUtil.getRequestParamObj(value.id, ebayPlatform, paymentType);
            if(requestParamRec) {
                let url = 'https://apiz.ebay.com/sell/finances/v1/payout?filter=payoutDate:[${startTime}..${endTime}]&limit=${pageSize}&offset=${pageNumber}';
                url = requestParamRec.getValue('custrecord_next_token')?requestParamRec.getValue('custrecord_next_token'):methodUtil.setUrl(url,requestParamRec);
                log.debug('url', url);
                value.token = !value.token?requestUtil.ebayAuth(value):value.token;

                let headers = {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer '+value.token,
                    'Accept': 'application/json',
                    'Accept-Encoding': 'application/json'
                };
                let response = requestUtil.request(url, headers, null, https.Method.GET);
                if(response.body) {
                    let body = JSON.parse(response.body);
                    log.debug('订单数量{}', body.total);
                    if(body.total > 0){
                        methodUtil.createFile('Ebay_Payout_', value, response, 611, ebayPlatform, paymentType);
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
                    }else {requestUtil.submitCDRequestParam(requestParamRec,body.total);}
                }else if(response.code == 204) {requestUtil.submitCDRequestParam(requestParamRec, 0);}
            }else {requestUtil.saveStoreMsg(value.id, '未维护平台Payment接口参数');}
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const reduce = (context) => {
        
    }

    const summarize = (summary) => {
        log.debug('', 'end');
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});
