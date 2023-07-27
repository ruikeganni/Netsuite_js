/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/https', 'N/http', 'N/encode', 'N/xml', 'N/file', 'N/search', 'N/record'], 
(https, http, encode, xml, file, search, record) => {

    const urlType = 1; //auth
    const cdPlatform = 24; //Cdisocunt

    const request = (url, headers, body, method) => {
        return https.request({
            method: method,
            url: url,
            headers: headers,
            body: body
        });
    }

    /**
     * Cdiscount授权获取TOKEN
     * @param {*} storeId NS店铺账号内部标识
     * @param {*} base64 clientId:clientSecret格式加密Base64编码
     * @returns 
     */
    const cdiscountAuth = (storeId,base64) => {
        try{
            let url;
            search.create({
                type: 'customrecord_platform_url',
                filters:
                    [
                        ['custrecord_url_type', 'is', urlType], 'AND', 
                        ['custrecord_sales_platform2', 'is', cdPlatform]
                    ],
                columns:['custrecord_platform_url']
            }).run().each(function(result) {
                url = result.getValue('custrecord_platform_url');
            });
            log.debug('authUrl', url);
            if(url){
                let headers = {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic '+ base64
                };
                let response = request(url, headers, null, https.Method.GET);
                let body = response.body;
                log.debug('CD_Auth_Response', response);
                body = body.replace('<string xmlns=\"http://schemas.microsoft.com/2003/10/Serialization/\">', '');
                body = body.replace('</string>', '');
                record.submitFields({
                    type: 'customrecord_hc_seller_profile',
                    id: storeId,
                    values: {
                        custrecord_access_token: body,
                        custrecord_request_error_msg: ''
                    }
                });
                log.debug('账号:'+storeId+' 获取新TOKEN', body)
                return body;
            }
        }catch(e) {
            record.submitFields({
                type: 'customrecord_hc_seller_profile',
                id: storeId,
                values: {
                    custrecord_request_error_msg: e.message
                }
            });
            log.debug('error', e.message + e.stack);
        }
    }

    /**
     * Ebay授权换取accessToken
     * @param {*} store 店铺账号
     */
    const ebayAuth = (store) => {
        try{
            let base64 = encode.convert({
                string: store.clientId+':'+store.clientSecret,
                inputEncoding: encode.Encoding.UTF_8,
                outputEncoding: encode.Encoding.BASE_64_URL_SAFE
            });
            let url = 'https://api.ebay.com/identity/v1/oauth2/token?grant_type=refresh_token&refresh_token='+store.refreshToken;
            log.debug('authUrl', url);
            let headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic '+ base64,
                'Accept': 'application/json'
            };
            let response = request(url, headers, null, https.Method.POST);
            let body = JSON.parse(response.body);
            log.debug('authResponse', response);
            if(body.access_token) {
                log.debug('ebay{}'+store.id, 'newToken{}'+body.access_token);
                record.submitFields({
                    type: 'customrecord_hc_seller_profile',
                    id: store.id,
                    values: {
                        custrecord_access_token: body.access_token,
                        custrecord_request_error_msg: ''
                    }
                });
                return body.access_token;
            }else{
                record.submitFields({
                    type: 'customrecord_hc_seller_profile',
                    id: store.id,
                    values: {
                        custrecord_request_error_msg: body
                    }
                });
            }
        }catch(e) {
            record.submitFields({
                type: 'customrecord_hc_seller_profile',
                id: store.id,
                values: {
                    custrecord_request_error_msg: e.message
                }
            });
            log.debug('error', e.message + e.stack);
        }
    }

    /**
     * 条件查询平台接口参数
     * @param {*} storeId 店铺账号内部标识
     * @param {*} platform 平台渠道内部标识
     * @param {*} type 类型1:Order 2:Return 3:Payment
     * @returns 
     */
    const getRequestParamObj = (storeId, platform, type) => {
        let obj = {};
        search.create({
            type: 'customrecord_platform_request_param',
            filters:
                [
                    ['custrecord_platform_type','is', platform],'AND',
                    ['custrecord_seller_dev','is', storeId],'AND',
                    ['custrecord_request_type','is', type]
                ],
            columns:[]
        }).run().each(function(result) {
            obj = record.load({
                type: 'customrecord_platform_request_param',
                id: result.id
            });
        });
        return obj;
    }

    /**
     * 提交店铺请求消息
     * @param storeId 店铺账号ID
     * @param msg 错误信息
     */
    const saveStoreMsg = (storeId,msg) => {
        record.submitFields({
            type: 'customrecord_hc_seller_profile',
            id: storeId,
            values: {
                custrecord_request_error_msg: msg
            }
        });
    }

    /**
     * startTime = endTime - 10Seconds, 
     * endTime = if(new Date() - endTime) > 5Date?endTime+5Date:new Date()
     * @param {*} requestParamRec 接口请求参数对象
     */
    const submitCDRequestParam = (requestParamRec, total) => {
        let date = new Date();
        let newEndTime = requestParamRec.getValue('custrecord_request_end_time');
        let usedTime = date - newEndTime;
        let days = Math.floor(usedTime/(24*3600*1000));
        if(days > 5){
            newEndTime = newEndTime.setDate(newEndTime.getDate()+5);
        }else{
            newEndTime = date;
        }
        newEndTime = new Date(newEndTime);
        let newStartTime = requestParamRec.getValue('custrecord_request_end_time');
        newStartTime = newStartTime.setSeconds(newStartTime.getSeconds() - 10);
        newStartTime = new Date(newStartTime);
        //接口请求参数: 请求状态false
        record.submitFields({
            type: 'customrecord_platform_request_param',
            id: requestParamRec.id,
            values: {
                custrecord_interface_in_request: false,
                custrecord_request_start_time: newStartTime,
                custrecord_request_end_time: newEndTime,
                custrecord_next_token: null,
                custrecord_total_number: total
            }
        });
    }
    
    return {
        request: request,
        cdiscountAuth: cdiscountAuth,
        getRequestParamObj: getRequestParamObj,
        saveStoreMsg: saveStoreMsg,
        submitCDRequestParam: submitCDRequestParam,
        ebayAuth: ebayAuth
    }
    
});
