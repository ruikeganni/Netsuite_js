/**
 * 店铺账号“eBay授权”按钮
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
 define(['N/record', 'N/search', 'N/https', '../util/PLATFORM_UTIL_REQUEST'], 
 function(record, search, https, requestUtil) {
 
     function beforeLoad(context) {
         try{
             var rec = context.newRecord;
             if(context.type == 'view' && 
                 rec.id == 104 &&
                 // rec.getText('custrecord_hc_sp_sales_channel') == 'eBay' &&
                 !rec.getValue('custrecord_platform_code') && 
                 !rec.getValue('custrecord_refresh_token')){
                     var form = context.form;
                     form.clientScriptFileId = 1187190;   //TODO:关联客户端脚本RECORD_BUTTON_METHOD.js的内部id
                     form.addButton({
                         id:'custpage_store_ebay_auth',
                         label:'eBay授权',
                         // functionName:'eBayAuth('+JSON.stringify(rec)+')'
                         functionName: 'test'
                     });
             }
         }catch(e){
             log.debug('error',e.message+e.stack);
         }
     }
 
     function beforeSubmit(context) {
         
     }
 
     function afterSubmit(context) {
         try{
             var rec = context.newRecord;
             
             //refresh_token为空，code不为空
             if(!rec.getValue('custrecord_refresh_token') && rec.getValue('custrecord_platform_code')){
                 var url = 'https://api.ebay.com/identity/v1/oauth2/token?grant_type=authorization_code&code=${code}&redirect_uri=${redirect_uri}';
                 
                 var base64 = encode.convert({
                     string: rec.getValue('custrecord_client_id')+':'+rec.getValue('custrecord_client_secret'),
                     inputEncoding: encode.Encoding.UTF_8,
                     outputEncoding: encode.Encoding.BASE_64_URL_SAFE
                 });
 
                 url.replace('${code}',rec.getValue('custrecord_platform_code'));
                 url.replace('${redirect_uri}','--dlmh1213-PRD-4-faoqp');
 
                 var header = {
                     'Content-Type': 'application/x-www-form-urlencoded',
                     'Authorization': 'Basic '+base64
                 }
 
                 var response = requestUtil.request(url, header, null, Https.Method.POST);
                 
                 var body = JSON.parse(response.body);
                 if(response.code == 200 && body.refresh_token){
                     record.submitFields({
                         type: 'customrecord_hc_seller_profile',
                         id: rec.id,
                         values: {
                             custrecord_access_token: body.access_token,
                             custrecord_refresh_token: body.refresh_token,
                             custrecord_request_error_msg: ''
                         }
                     });
                 }else{
                     record.submitFields({
                         type: 'customrecord_hc_seller_profile',
                         id: rec.id,
                         values: {
                             custrecord_request_error_msg: response.body
                         }
                     });
                 }
             }
         }catch(e){
             log.debug(e.message + '' + e.stack);
         }
     }
 
     return {
         beforeLoad: beforeLoad,
         beforeSubmit: beforeSubmit,
         afterSubmit: afterSubmit
     }
 });
 