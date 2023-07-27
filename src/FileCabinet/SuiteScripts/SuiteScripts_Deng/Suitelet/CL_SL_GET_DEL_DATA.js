/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/search'], 
(search) => {

    const onRequest = (context) => {
        try {
            let obj = [];
            let del_search = search.load('customsearch1012').run();
            let all_data = del_search.getRange({start: 0, end: 1000});

            let search_index = 1000;
            while(true) {
                if(search_index == all_data.length) {
                    var to_data_ex = del_search.getRange({start: search_index, end: search_index + 1000});
                    if (to_data_ex.length > 0) {
                        all_data = all_data.concat(to_data_ex);
                    }
                    search_index = search_index + 1000;
                }else {
                    break;
                }
            }
            obj = all_data.map(o => {return {type: o.recordType, id: o.id}});
            log.debug('obj', obj);
            context.response.write(JSON.stringify(obj));
        }catch (e) {
            log.debug('error', e.message + e.stack);
        }
    }

    return {
        onRequest: onRequest
    }
});
