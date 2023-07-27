/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
*/
define(['N/search', 'N/record', 'N/url','N/https', 'N/runtime'], 
(search, record, url, https, runtime) => {

    const onRequest = (context) => {
        try{
            let searchId = runtime.getCurrentScript().getParameter('custscript1');
            let mySearch = search.load({
                id: searchId
            });
            let searchResult = mySearch.run().getRange(0, 200);
            for(let i = 0; i < searchResult.length; i ++) {
                let result = searchResult[i];
                try{
                    log.debug(result.recordType, result.id);
                    record.delete({
                        type: result.recordType, 
                        id: result.id
                    });
                }catch(e1) {
                    log.debug('error',e1.message + ';' + e1.stack);
                    if(e1.message.indexOf('脚本执行使用') != -1) {
                        break;
                    }
                }
            }
        }catch(e) {
            log.debug('error', e.message+ ';' + e.stack);
        }
    }

    return {
        onRequest: onRequest
    }
});