/**
 * Cdiscount销售订单抓取
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', './util/moment', 'N/search', 'N/file',  'N/https', 'N/encode', 'N/runtime', './util/PLATFORM_UTIL_REQUEST', './util/PLATFORM_UTIL_METHOD'], 
(record, moment, search, file, https, encode, runtime, requestUtil, methodUtil) => {
    
    const cdPlatform = 24; //Cdiscount平台
    
    const orderType = 1;  //接口类型Order
    const url = 'https://wsvc.cdiscount.com/MarketplaceAPIService.svc';

    const getInputData = () => {
        try{
            let allSellerDev = [];
            let sellerDevSearchId = runtime.getCurrentScript().getParameter('custscript2');
            log.debug('sellerDev', sellerDevSearchId);
            search.load(sellerDevSearchId).run().each(function(result) {
                result.getValue('custrecord_hc_sp_sales_channel') == cdPlatform ? allSellerDev[allSellerDev.length] = {
                    id: result.id,
                    name: result.getValue('name'),
                    clientId: result.getValue('custrecord_client_id'),
                    clientSecret: result.getValue('custrecord_client_secret'),
                    token: result.getValue('custrecord_access_token')
                }:[];
                return true;
            });
            log.debug('allSellerDev', allSellerDev);
            return allSellerDev;
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const map = (context) => {
        try{
            let value = JSON.parse(context.value);
            let requestParamRec = requestUtil.getRequestParamObj(value.id, cdPlatform, orderType);
            if(requestParamRec) {
                let startTime = requestParamRec.getValue('custrecord_request_start_time');
                let endTime = requestParamRec.getValue('custrecord_request_end_time');
                startTime = moment(startTime).utc().format('YYYY-MM-DD[T]HH:mm:ss.ss');
                endTime = moment(endTime).utc().format('YYYY-MM-DD[T]HH:mm:ss.ss');
                log.debug(value.name, 'startTime{}'+ startTime+' : endTime{}'+endTime);

                let base64 = value.clientId+':'+value.clientSecret;
                base64 = encode.convert({
                    string: base64,
                    inputEncoding: encode.Encoding.UTF_8,
                    outputEncoding: encode.Encoding.BASE_64_URL_SAFE
                });

                let response = getOrders(value, startTime, endTime, base64);
                let body = response.body;
                
                let isRequest = false;
                if(body.indexOf('token') != -1 || 
                    body.indexOf('Token id is not correctly formatted') != -1 ||
                    body.indexOf('has expired') != -1) {
                    log.debug('body',body);
                    let token = requestUtil.cdiscountAuth(value.id, base64);
                    token? (value.token = token,isRequest = true):requestUtil.saveStoreMsg(value.id, 'Seller Dev Error');
                }
                if(isRequest) {response = getOrders(value,startTime,endTime,base64);}
                if(response.body.indexOf('OrderList') != -1) {
                    let orderNumber = 0;
                    if(response.body.indexOf('OrderNumber') != -1) {
                        methodUtil.createFile('Cdiscount_Orders_', value, response, 607, cdPlatform, orderType);
                        orderNumber = response.body.indexOf('OrderNumber');
                    }
                    log.debug('OrderNumber', orderNumber);
                    requestUtil.submitCDRequestParam(requestParamRec, orderNumber);
                    requestUtil.saveStoreMsg(value.id, '');
                }else {
                    requestUtil.saveStoreMsg(value.id, 'Orders Request Error');
                }
            }else {
                log.debug(value.name, '未维护平台接口参数');
                requestUtil.saveStoreMsg(value.id, '未维护平台接口参数');
            }
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    /**
     * 参数设置, 订单接口请求
     * @param value 店铺账号
     * @param startTime 开始时间
     * @param endTime 结束时间
     * @param base64 账号Base64编码
     * @returns 
     */
    const getOrders = (value, startTime, endTime, base64) => {
        //接口请求参数内容
        let getOrderCallParam = file.load('SuiteScripts/SuiteScripts_Deng/cdiscount_xml/GetOrderList-call.xml').getContents();
        getOrderCallParam = getOrderCallParam.replace('${token}', value.token);
        getOrderCallParam = getOrderCallParam.replace('${BeginDateTime}', startTime);
        getOrderCallParam = getOrderCallParam.replace('${EndDateTime}', endTime);

        let headers = {
            'Content-Type': 'text/xml;charset=UTF-8',
            'SoapAction': 'http://www.cdiscount.com/IMarketplaceAPIService/GetOrderList',
            'Authorization': 'Basic '+base64
        };

        let response = requestUtil.request(url, headers, getOrderCallParam, https.Method.POST);
        return response;
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
