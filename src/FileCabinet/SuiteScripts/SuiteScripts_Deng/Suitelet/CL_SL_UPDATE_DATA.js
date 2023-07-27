/**
 *@NApiVersion 2.x
 *@NScriptType Suitelet
 */
define(['N/record', 'N/search'], 
function(record, search) {

    function onRequest(context) {
        var obj = {};
        try{
            // 店铺：store
            // 平台：platform
            // 仓库：location
            // 数据类型：type
            // 内部标识：ns_id
            log.debug('context', context.request.body);
            obj.success = true;
            obj.status = 'success';
            obj.message = '';
        }catch(e){
            log.debug('error', e.message + ';' + e.stack);
            obj.success = false;
            obj.status = 'fail';
            obj.message = e.message;
        }
        context.response.write(JSON.stringify(obj));
    }

    return {
        onRequest : onRequest
    }
});
