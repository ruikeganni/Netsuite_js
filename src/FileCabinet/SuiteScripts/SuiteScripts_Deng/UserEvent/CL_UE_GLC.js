/**
 * 头程物流费用|UE
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/ui/serverWidget'], (serverWidget) => {

    function beforeLoad(context) {
        let rec = context.newRecord;
        let form = context.form;
        //头程物流费用已存在账单，禁止修改所有字段
        if(rec.getValue('custrecord_hc_glc_vendor_bill')) {
            let fields = [
                'custrecord_hc_glc_estimated_cost',
                'custrecord_hc_glc_currency',
                'custrecord_hc_glc_cost_type',
                'custrecord_hc_glc_forwarder',
                'custrecord_hc_glc_bill_subsidiary',
                // 'custrecord_hc_glc_allocation',
                // 'custrecord_hc_glc_allocation_rule',
                'custrecord_hc_glc_bill_order',
                'custrecord_hc_glc_bill_check_date'
            ];
            for(let key in fields) {
                form.getField(fields[key]).updateDisplayType({
                    displayType : serverWidget.FieldDisplayType.DISABLED
                });
            }
        }
    }

    function beforeSubmit(context) {
        
    }

    function afterSubmit(context) {
        
    }

    return {
        beforeLoad: beforeLoad,
        // beforeSubmit: beforeSubmit,
        // afterSubmit: afterSubmit
    }
});
