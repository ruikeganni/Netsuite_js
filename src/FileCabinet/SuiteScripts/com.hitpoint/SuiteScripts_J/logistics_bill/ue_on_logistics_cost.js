/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * version      date                user            memo
 * 1.0           2022.07.14     Josie           新建：物流费用账单入库后，不允许新增或者编辑头程物流费用记录
 */
define(['N/record','N/runtime','N/search'],
    /**
     * @param{record} record
     */
    (record,runtime,search) => {
        const beforeLoad = (scriptContext) => {
            if(scriptContext.type == 'edit'&&runtime.executionContext == 'USERINTERFACE'&&(runtime.getCurrentUser().role!=3&&runtime.getCurrentUser().role!=1004)){
                let newRec= scriptContext.newRecord;
                let parentId  = newRec.getValue('custrecord_hc_glc_bill_order');
                if(parentId){
                    let parentRec = search.lookupFields({type:'customrecord_hc_global_logistics_bill',id:parentId,columns:['custrecord_hc_glcb_received']});
                    let isReceived = parentRec.custrecord_hc_glcb_received;
                    if(isReceived){
                        throw '头程物流费用账单已入库，不可修改'
                    }
                }
            }
        }


        const beforeSubmit = (scriptContext) => {
            if((scriptContext.type == 'create'||scriptContext.type == 'edit')&&runtime.executionContext == 'USERINTERFACE'&&(runtime.getCurrentUser().role!=3&&runtime.getCurrentUser().role!=1004)){
                let newRec= scriptContext.newRecord;
                let parentId  = newRec.getValue('custrecord_hc_glc_bill_order');
                if(parentId){
                    let parentRec = search.lookupFields({type:'customrecord_hc_global_logistics_bill',id:parentId,columns:['custrecord_hc_glcb_received']});
                    let isReceived = parentRec.custrecord_hc_glcb_received;
                    if(isReceived){
                        throw '头程物流费用账单已入库，不可新增/编辑头程物流费用记录'
                    }
                }
            }
        }

        const afterSubmit = (scriptContext) => {

        }

        return {
            beforeLoad,
            beforeSubmit,
            // afterSubmit
        }

    });