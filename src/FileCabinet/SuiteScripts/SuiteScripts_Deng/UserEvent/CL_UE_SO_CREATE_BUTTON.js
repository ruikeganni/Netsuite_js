/**
 * 订单发货通知按钮
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
*/
define(['N/record', 'N/search', '../util/RECORD_BUTTON_METHOD'], 
function(record, search, buttonMethod) {

    const beforeLoad = (context) => {
        try{
            let rec = context.newRecord;
            if(context.type == 'view' && rec.getValue('custrecord_hc_mofo_created_from') && !rec.getValue('custrecord_so_fulfillment_status')) {
                let soRec = search.lookupFields({
                    type: 'customrecord_hc_merchant_order',
                    id: rec.getValue('custrecord_hc_mofo_created_from'),
                    columns: ['custrecord_hc_mo_ecommerce_platform']
                });
                if(soRec.custrecord_hc_mo_ecommerce_platform && (soRec.custrecord_hc_mo_ecommerce_platform[0].text == 'eBay' || soRec.custrecord_hc_mo_ecommerce_platform[0].text == 'Cdiscount')){
                    // log.debug('platform', soRec.custrecord_hc_mo_ecommerce_platform[0].text);
                    let form = context.form;
                    form.clientScriptFileId = 1187190;   //TODO:关联客户端脚本RECORD_BUTTON_METHOD.js的内部id
                    form.addButton({
                        id: 'custpage_so_fulfillment_button',
                        label: '标记发货',
                        functionName: 'soFulfillment('+JSON.stringify(rec)+')'
                    });
                }
            }
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const beforeSubmit = (context) => {
        
    }

    const afterSubmit = (context) => {
        try{
            let rec = context.newRecord;
            if(rec.getValue('custrecord_hc_mofo_created_from')){
                let soRec = search.lookupFields({
                    type: 'customrecord_hc_merchant_order',
                    id: rec.getValue('custrecord_hc_mofo_created_from'),
                    columns: ['custrecord_hc_mo_ecommerce_platform']
                });
                if(soRec.custrecord_hc_mo_ecommerce_platform.length > 0 && 
                    soRec.custrecord_hc_mo_ecommerce_platform[0].text == 'eBay' &&
                    rec.getValue('custrecord_hc_mofo_tracking_number') && rec.getValue('custrecord_hc_mofo_carrier') && !rec.getValue('custrecord_so_fulfillment_status') && rec.getValue('custrecord_fo_customer') == 831){
                        log.debug('标记发货', rec.getValue('custrecord_hc_mofo_coustom_order_no'));
                        buttonMethod.soFulfillment(rec);
                }
            }
        }catch(e) {
            log.debug('error', e.message + ';' + e.stack);
        }
    }

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    }
});