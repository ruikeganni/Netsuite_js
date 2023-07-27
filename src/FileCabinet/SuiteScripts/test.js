/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/encode', 'N/http', 'N/crypto', 'N/https', './util/PLATFORM_UTIL_REQUEST', 'N/search', 'N/record'], 
(encode, http, crypto, https, requestUtil, search, record) => {
  
    const onRequest = (context) => {
        let obj = {};
        try {
            let body = JSON.parse(context.request.body);
            let ids = body.ids;
            log.debug(body.type, ids);
            for(let i = 0; i < ids.length; i++) {
                record.delete.promise({
                    type: body.type,
                    id: ids[i]
                });
            }
            obj.id = body.ids;
            obj.success = true;
            obj.msg = 'success';
        } catch (e) {
            log.debug('error', e.message + ';' + e.stack);
            obj.id = body.id;
            obj.success = false;
            obj.msg = e.message;
        }
        context.response.write(JSON.stringify(obj));
    }

    const jeCancelCP = () => {
        let obj = [];
        let mySearch = search.load({
            id: 'customsearch1012'
        });
        let searchResult = mySearch.run().getRange(0, 1000);
        for(let i = 0; i < searchResult.length; i ++){
            let result = searchResult[i];
            obj[obj.length] = result.id;
        }
        log.debug('obj', obj);
        //账单付款
        let cpRec = record.load({
            type: 'customerpayment',
            id: 1065144
        });
        let applys = cpRec.getLineCount('apply');
        for(let l = 0; l < applys ; l++){
            let apply = cpRec.getSublistValue('apply', 'apply', l);
            let internalid = cpRec.getSublistValue('apply', 'internalid', l);
            if(obj.indexOf(internalid) != -1 && apply == true){
                log.debug(internalid, apply);
                cpRec.setSublistValue('apply', 'apply', l, false);
            }
        }
        cpRec.save();
    }
    
    return {
      onRequest: onRequest
    };
  });
  