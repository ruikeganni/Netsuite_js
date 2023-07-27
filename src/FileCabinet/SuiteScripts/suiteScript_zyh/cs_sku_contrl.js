/**
 * SKU
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/record', 'N/search'], 
function(record, search) {

    function pageInit(context) {
        
    }

    function saveRecord(context) {
        
    }

    function validateField(context) {
        
    }

    function fieldChanged(context) {
        try{
            var curRec = context.currentRecord;
            var fieldId = context.fieldId;
            log.debug('fieldId', fieldId);
            log.debug('店铺', curRec.getValue('custrecord_hc_sku_customer'));
            if(fieldId === 'custrecord_hc_sku_customer' && curRec.getValue('custrecord_hc_sku_customer')) {
                var sellerProRec = search.lookupFields({
                    type:'customrecord_hc_seller_profile',
                    id: curRec.getValue('custrecord_hc_sku_customer'),
                    columns: ['custrecord_hc_sp_sales_channel']
                })
                log.debug('custrecord_hc_sp_sales_channel', sellerProRec.custrecord_hc_sp_sales_channel[0]);
                if(sellerProRec.custrecord_hc_sp_sales_channel){
                    curRec.setValue('custrecord_hc_sku_sales_plantform', sellerProRec.custrecord_hc_sp_sales_channel[0].value);
                }
            }
        }catch(e){
            log.debug('error', e.message+';'+e.stack);
        }finally{
            return true;
        }
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
        // saveRecord: saveRecord,
        // validateField: validateField,
        fieldChanged: fieldChanged
        // postSourcing: postSourcing,
        // lineInit: lineInit,
        // validateDelete: validateDelete,
        // validateInsert: validateInsert,
        // validateLine: validateLine,
        // sublistChanged: sublistChanged
    }
});
