/**
 *@NApiVersion 2.x
 */
// *@NModuleScope Public
define(['N/record', 'N/https', './PLATFORM_UTIL_REQUEST', 'N/search', 'N/file'], 
function(record, https, requestUtil, search, file) {

    function pageInit(context){
        
    }

    function soFulfillment(rec){
        var soFulRec = rec;
        try{
            alert('请求提交中...');
            //订单发货通知
            rec = search.lookupFields({
                type: 'customrecord_hc_mo_fulfillment_order',
                id: soFulRec.id,
                columns: [
                            'custrecord_hc_mofo_tracking_number', 'custrecord_so_fulfillment_status', 
                            'custrecord_hc_mofo_created_from','custrecord_hc_mofo_order_id', 'custrecord_hc_mofo_recipient_name',
                            'custrecord_hc_mofo_carrier', 'custrecord_hc_mofo_shipped_successfully'
                        ]
            });
            var requestBol = true;
            var errorMsg = '';
            if(!rec.custrecord_hc_mofo_tracking_number){
                errorMsg = '请求提交失败，物流跟踪号为空！';
                alert(errorMsg);
                requestBol = false;
            }else if(rec.custrecord_so_fulfillment_status){
                errorMsg = '请求提交失败，发货单已标记发货成功！';
                alert(errorMsg);
                requestBol = false;
            }else if(!rec.custrecord_hc_mofo_carrier){
                errorMsg = '请求提交失败，物流承运商为空！';
                alert(errorMsg);
                requestBol = false;
            }
            // else if(!rec.custrecord_hc_mofo_shipped_successfully){
            //     errorMsg = '请求提交失败，发货单还未出库！';
            //     alert(errorMsg);
            //     requestBol = false;
            // }

            if(!requestBol){
                throw new Error(errorMsg);
            }
            //商家订单
            var soRec = search.lookupFields({
                type: 'customrecord_hc_merchant_order',
                id: rec.custrecord_hc_mofo_created_from[0].value,
                columns: ['custrecord_hc_mo_ecommerce_platform','custrecord_hc_mo_seller_profile']
            });

            var requestSearch = search.create({
                type: 'customrecord_request_list',
                filters: [
                    ['custrecord_request_so_fulfillment','is',soFulRec.id]
                ],
                columns: []
            });
            var results = requestSearch.run().getRange({
                start: 0,
                end: 1
            });
            var requestRec;
            if(results.length <= 0){
                requestRec = record.create({
                    type: 'customrecord_request_list'
                });
            }else{
                requestRec = record.load({
                    type: 'customrecord_request_list',
                    id: results[0].id
                });
            }

            var url = '';
            var header = {};
            var body = '';
            if(soRec.custrecord_hc_mo_ecommerce_platform[0].text == 'eBay'){
                url = 'https://api.ebay.com/sell/fulfillment/v1/order/'+rec.custrecord_hc_mofo_order_id+'/shipping_fulfillment';
                header = {
                    'Content-Type': 'application/json',
                    'Accept': '*/*',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Authorization': 'Bearer ',
                }
                body = JSON.stringify(EbayFulfillmentBody(soFulRec.id,rec,soRec));
            }else if(soRec.custrecord_hc_mo_ecommerce_platform[0].text == 'Cdiscount'){
                url = 'https://wsvc.cdiscount.com/MarketplaceAPIService.svc';
                header = {
                    'tete': 'text/xml',
                    'Accept-Encoding': 'gzip,deflate',
                    'SoapAction': 'http://www.cdiscount.com/IMarketplaceAPIService/ValidateOrderList'
                }
                body = CDFulfillmentValidateOrderListBody();
                body = body.replace('${order}',CDFulfillmentOrderBody(soFulRec.id,rec,soRec));
            }
            requestRec.setValue('custrecord_request_url', url);
            requestRec.setValue('custrecord_request_method', https.Method.POST);
            requestRec.setValue('custrecord_request_body', body);
            requestRec.setValue('custrecord_request_header', JSON.stringify(header));
            requestRec.setValue('custrecord_request_store', soRec.custrecord_hc_mo_seller_profile[0].value);
            requestRec.setValue('custrecord_request_status', 'NEW');
            requestRec.setValue('custrecord_request_so', rec.custrecord_hc_mofo_created_from[0].value);
            requestRec.setValue('custrecord_request_so_fulfillment', soFulRec.id);
            requestRec.setValue('custrecord_request_platform', soRec.custrecord_hc_mo_ecommerce_platform[0].value);
            requestRec.setValue('custrecord_request_type_1', 'Fulfillment');
            requestRec.setValue('name', soFulRec.id+'{}'+rec.custrecord_hc_mofo_created_from[0].value);
            var requestRecId = requestRec.save();
            alert('请求提交成功！');
            record.submitFields({
                type: 'customrecord_hc_mo_fulfillment_order',
                id: soFulRec.id,
                values: {
                    custrecord_so_ful_req_submit_status: 'REQUEST_SUBMIT_SUCCESS',
                    custrecord_so_ful_req_submit_log: ''
                }
            });

            //==========================================Request============================================
            try{
                var storeRec = search.lookupFields({
                    type: 'customrecord_hc_seller_profile',
                    id: soRec.custrecord_hc_mo_seller_profile[0].value,
                    columns: ['custrecord_access_token']
                });

                var obj;
                if(soRec.custrecord_hc_mo_ecommerce_platform[0].text == 'Cdiscount'){
                    body = body.replace('${token}', storeRec.custrecord_access_token);
                    obj = cdRequest(url,header,body);
                }
                else{
                    header.Authorization = header.Authorization+storeRec.custrecord_access_token;
                    log.debug('token', header.Authorization);
                    obj = ebayRequest(url,header,body);
                    if(obj.body && obj.body.indexOf('token') != -1){
                        var token = requestUtil.ebayAuth(value);
                        if(token){
                            header.Authorization = 'Bearer '+ token;
                            obj = ebayRequest(url,header,body);
                        }
                    }
                }
                log.debug('response', obj);
                record.submitFields({
                    type: 'customrecord_hc_mo_fulfillment_order',
                    id: soFulRec.id,
                    values: {
                        custrecord_so_ful_req_submit_status: obj.Validated?'REQUEST_REQUEST_SUCCESS':'REQUEST_REQUEST_FAIL',
                        custrecord_so_fulfillment_status: obj.Validated?true:false,
                        custrecord_so_ful_req_submit_log: obj.Validated?'':obj.body
                    }
                });
                if(obj.Validated){
                    alert('订单{}'+rec.custrecord_hc_mofo_order_id+',平台标记发货成功！');
                }else{
                    alert('订单{}'+rec.custrecord_hc_mofo_order_id+',平台标记发货失败！Error: '+obj.body);
                }
                record.submitFields({
                    type: 'customrecord_request_list',
                    id: requestRecId,
                    values: {
                        custrecord_request_status: obj.Validated?'SUCCESS':'FAIL'
                    }
                });
            }catch(e1){
                log.debug('request.error', e1.message+e1.stack);
            }
        }catch(e){
            alert('请求提交失败，'+e.message);
            log.debug('请求提交失败', e.message);
            record.submitFields({
                type: 'customrecord_hc_mo_fulfillment_order',
                id: soFulRec.id,
                values: {
                    custrecord_so_ful_req_submit_status: 'REQUEST_SUBMIT_ERROR',
                    custrecord_so_ful_req_submit_log: e.message+'{}'+e.stack
                }
            });
        }
    }

    function CDFulfillmentValidateOrderListBody(){
        var body = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ValidateOrderList xmlns="http://www.cdiscount.com"><headerMessage xmlns:a="http://schemas.datacontract.org/2004/07/Cdiscount.Framework.Core.Communication.Messages" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">';
        body = body + '<a:Context><a:SiteID>100</a:SiteID></a:Context>';
        body = body + '<a:Localization><a:Country>Fr</a:Country></a:Localization>';
        body = body + '<a:Security><a:DomainRightsList i:nil="true" /><a:IssuerID i:nil="true" /><a:SessionID i:nil="true" /><a:SubjectLocality i:nil="true" /><a:TokenId>${token}</a:TokenId><a:UserName i:nil="true" /></a:Security>';
        body = body + '<a:Version>1.0</a:Version>';
        body = body + '</headerMessage><validateOrderListMessage xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><OrderList>${order}</OrderList></validateOrderListMessage></ValidateOrderList></s:Body></s:Envelope>';
        return body;
    }

    /**
     * CD标记发货Body
     * @param {*} fulRec 订单发货通知
     * @param {*} soRec 商家订单
     * @returns 
     */
    function CDFulfillmentOrderBody(soFulRecId,fulRec,soRec){
        var body = '<ValidateOrder><CarrierName>'+fulRec.custrecord_hc_mofo_recipient_name+'</CarrierName><OrderLineList>';

        var itemSearch = search.create({
            type: 'customrecord_hc_mo_fulfillment_items',
            filters: [
                ['custrecord_hc_mofi_fulfillment_order','is',soFulRecId]
            ],
            columns: ['custrecord_hc_mofi_line_item_key', 'custrecord_hc_mofi_quantity', 'custrecord_hc_mofi_order_item_id', 'custrecord_hc_mofi_sku_fulfill_qty']
        });
        itemSearch.run().each(function(result){
            body = body + '<ValidateOrderLine><AcceptationState>ShippedBySeller</AcceptationState><ProductCondition>New</ProductCondition><SellerProductId>'+result.getValue('custrecord_hc_mofi_line_item_key')+'</SellerProductId></ValidateOrderLine>';
            return true;
        });
        body = body + '</OrderLineList><OrderNumber>'+fulRec.custrecord_hc_mofo_order_id+'</OrderNumber><OrderState>Shipped</OrderState><TrackingNumber>'+fulRec.custrecord_hc_mofo_tracking_number+'</TrackingNumber><CarrierName>'+fulRec.custrecord_hc_mofo_carrier[0].text+'</CarrierName></ValidateOrder>';
        return body;
    }

    /**
     * Ebay标记发货Body
     * @param {*} fulRec 订单发货通知
     * @param {*} soRec 商家订单
     * @returns 
     */
    function EbayFulfillmentBody(soFulRecId,fulRec,soRec){
        var body = {};
        body.trackingNumber = fulRec.custrecord_hc_mofo_tracking_number;
        body.shippingCarrierCode = fulRec.custrecord_hc_mofo_carrier[0].text;
        var lineItems = [];

        var itemSearch = search.create({
            type: 'customrecord_hc_mo_fulfillment_items',
            filters: [
                ['custrecord_hc_mofi_fulfillment_order','is',soFulRecId]
            ],
            columns: ['custrecord_hc_mofi_line_item_key', 'custrecord_hc_mofi_quantity', 'custrecord_hc_mofi_order_item_id',
            'custrecord_hc_mofi_order_item_id', 'custrecord_hc_mofi_sku_fulfill_qty']
        });
        itemSearch.run().each(function(result){
            var item = {};
            item.lineItemId = result.getValue('custrecord_hc_mofi_order_item_id');
            item.quantity = result.getValue('custrecord_hc_mofi_quantity');
            lineItems[lineItems.length] = item;
            return true;
        });

        body.lineItems = lineItems;
        return body;
    }

    /**
     * cd请求标记发货
     * @param {*} url 
     * @param {*} headers 
     * @param {*} body 
     * @returns 
     */
    function cdRequest(url,headers,body){
        var obj = {};
        var response = request(url, headers, body, https.Method.POST);
        var xmlDocument = xml.Parser.fromString({
            text: response.body
        });
        var bookNode = xml.XPath.select({
            node: xmlDocument,
            xpath: '//s:Body'
        });
        var ValidateOrderListResponse = bookNode[0].getElementsByTagName({
            tagName: 'ValidateOrderListResponse'
        });
        var ValidateOrderListResult = ValidateOrderListResponse[0].getElementsByTagName({
            tagName: 'ValidateOrderListResult'
        });
        var ValidateOrderResults = ValidateOrderListResult[0].getElementsByTagName({
            tagName: 'ValidateOrderResults'
        });
        var ValidateOrderResult = ValidateOrderResults[0].getElementsByTagName({
            tagName: 'ValidateOrderResult'
        });
        var Validated = ValidateOrderResult[0].getElementsByTagName({
            tagName: 'Validated'
        })[0].textContent;

        obj.body = response.body;
        obj.Validated = Validated;
        return obj;
    }

    /**
     * ebay请求标记发货
     * @param {*} url 
     * @param {*} headers 
     * @param {*} body 
     */
    function ebayRequest(url,headers,body){
        log.debug('url', url);
        log.debug('headers', headers);
        log.debug('body', body);
        var obj = {};
        var response = request(url, headers, body, https.Method.POST);
        if(response.code == 201){obj.Validated = true;}else{obj.Validated = false;}
        obj.body = response.body;
        return obj;
    }

    function request(url, headers, body, method){
        var response = https.request({
            method: method,
            url: url,
            headers: headers,
            body: body
        });
        return response;
    }

    /**
     * eBay店铺授权
     * @param {*} rec store
     */
    function eBayAuth(rec){
        try{
            alert('1');
            var rec = record.load({
                type: 'customrecord_hc_seller_profile',
                id: rec.id
            });
            if(!rec.getValue('custrecord_client_id') || !rec.getValue('custrecord_client_secret')){
                alert('client_id,client_secret必须填写完整！');
                return;
            }
            //dlmh1213-PRD-413f4a5b2-b2697db1
            var url = 'https://auth.ebay.com/oauth2/authorize?client_id=-'+rec.getValue('custrecord_client_id')+'&response_type=code&redirect_uri=--dlmh1213-PRD-4-faoqp&scope=https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.analytics.readonly https://api.ebay.com/oauth/api_scope/sell.finances https://api.ebay.com/oauth/api_scope/sell.payment.dispute https://api.ebay.com/oauth/api_scope/commerce.identity.readonly https://api.ebay.com/oauth/api_scope/commerce.notification.subscription https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly';
            window.open(url);
        }catch(e){
            log.debug('error', e.message + '' + e.stack);
        }
    }

    function test(){
        alert('1');
    }

    return {
        pageInit: pageInit,
        soFulfillment: soFulfillment,
        eBayAuth: eBayAuth,
        test: test
    }
});