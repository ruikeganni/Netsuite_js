/**
 * 头程物流费用|CLIENT
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/search', 'N/record'], 
(search, record) => {

    function pageInit(context) {

    }

    function saveRecord(context) {
        try{
            let rec = context.currentRecord;

            //头程物流费用创建时，根据登岸成本项+费用账单搜索是否已存在，已存在禁止创建
            let cost_type = rec.getValue('custrecord_hc_glc_cost_type');
            let glc_id = rec.getValue('custrecord_hc_glc_bill_order');
            if(!rec.id && cost_type && glc_id) {
                let glc_search = search.create({
                    type: 'customrecord_hc_global_logistics_cost',
                    filters: [
                        ['custrecord_hc_glc_bill_order', 'is', glc_id], 
                        'and', 
                        ['custrecord_hc_glc_cost_type', 'is', cost_type]
                    ],
                    columns: []
                });
                let glc_array = glc_search.run().getRange({start: 0, end: 1});
                log.debug('glc_array', glc_array);
                if(glc_array.length > 0) {
                    alert('已存在该登岸成本项！');
                    return false;
                }
            }
        }catch(e) {
            log.debug('e', e.message, e.stack);
        }
        return true;
    }

    function validateField(context) {
        
    }

    function fieldChanged(context) {
        
    }

    function postSourcing(context) {
        
    }

    function lineInit(context) {
        
    }

    function validateDelete(context) {
        
    }

    function validateInsert(context) {
        
    }

    function validateLine(context) {
        
    }

    function sublistChanged(context) {
        
    }

    return {
        // pageInit: pageInit,
        saveRecord: saveRecord,
        // validateField: validateField,
        // fieldChanged: fieldChanged,
        // postSourcing: postSourcing,
        // lineInit: lineInit,
        // validateDelete: validateDelete,
        // validateInsert: validateInsert,
        // validateLine: validateLine,
        // sublistChanged: sublistChanged
    }
});
