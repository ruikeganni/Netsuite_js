/**
 * Ebay拉取transaction数据
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', 'N/https', 'N/http', './util/PLATFORM_UTIL_REQUEST', './util/PLATFORM_UTIL_METHOD'], 
(record, https, http, requestUtil, methodUtil) => {

    const ebayPlatform = 5;
    const transactionType = 4;  //接口类型Transaction

    const getInputData = () => {
        return methodUtil.getStoreList();
    }

    const map = (context) => {
        try{
            let value = JSON.parse(context.value);
            log.debug('value', value);
            let requestParamRec = requestUtil.getRequestParamObj(value.id,ebayPlatform,transactionType);
            if(requestParamRec) {
                let url = 'https://apiz.ebay.com/sell/finances/v1/transaction?filter=transactionDate:[${startTime}..${endTime}]&limit=${pageSize}&offset=${pageNumber}';
                url = requestParamRec.getValue('custrecord_next_token')?requestParamRec.getValue('custrecord_next_token'):methodUtil.setUrl(url, requestParamRec);
                log.debug('url', url);
                value.token = !value.token?requestUtil.ebayAuth(value):value.token;
                let signatureResponse = http.get({
                    url: requestParamRec.getValue('custrecordsignature_url'),
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': '*/*'
                    }
                });
                let signatureObj = JSON.parse(signatureResponse.body);
                if(!signatureObj.signature) {
                    return;
                }
                log.debug('signature', signatureObj);
                let headers = {
                    'x-ebay-signature-key': 'eyJ6aXAiOiJERUYiLCJraWQiOiJiNmI4ZWY2MC0zODU4LTRiMGUtYTI5My1mZjQyOGJkZmMyZmMiLCJlbmMiOiJBMjU2R0NNIiwidGFnIjoiNXFFekNibjFTaFYxMUpTS0ZXR1dsZyIsImFsZyI6IkEyNTZHQ01LVyIsIml2IjoiSHUxVkpmdnBhWmp4V09VdyJ9.UvMuBe6GRNg7BNpYJkbNxo-EITKIOmpDJMcOiv5hBM0.uxWhH1krxU7bbKAt.VrRwrcxsCyW0-0bQL6N7P-7lfJRb7FmfLkuYBe6I6MvBEivMaNO302jLzZdjWrdl03FUNndEKiVMr4WSn5rtyMxmpYJEcAw63vADfulYgUomhURZJmot3Z0YPxwPilNzNnIC0oUrR6Ivm8h4HikJDUTpD8ggHPmRApoBSas8-kUeUfoFyF2-a11Gl-guyJFACqMgN592a4t79XiRoqTKltL36T6lBbddVDb5hc4mQUKa4OeILbCp9SqmD_R-dA.CXzHpRD14iSFdKDW2EH5MA',
                    'signature': signatureObj.signature,
                    'signature-input': signatureObj.signature_input,
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer '+value.token,
                    'Accept': 'application/json',
                    'Accept-Encoding': 'application/json'
                };
                let response = requestUtil.request(url, headers, null, https.Method.GET);
                if(response.body && response.body.indexOf('token') != -1) {
                    requestUtil.ebayAuth(value);
                }
                if(response.body && response.body.indexOf('token') == -1) {
                    let body = JSON.parse(response.body);
                    log.debug('订单数量{}', body.total);
                    if(body.total > 0) {
                        methodUtil.createFile('Ebay_Transaction_', value, response, 613, ebayPlatform, transactionType);
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
                    }else {
                        requestUtil.submitCDRequestParam(requestParamRec,body.total);
                    }
                }else if(response.code == 204) {requestUtil.submitCDRequestParam(requestParamRec,0);}
            }else {requestUtil.saveStoreMsg(value.id,'未维护平台Transaction接口参数');}
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