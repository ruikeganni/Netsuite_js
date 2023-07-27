/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * version      date                user            memo
 * 1.0           2022.03.14     Josie           新建：添加对账按钮
 * 2.0           2022.03.23     Josie          单据保存之后将本单设置到运单的’物流运费账单‘字段
 * 3.0           2022.07.14     Josie           单据入库之后要把单据锁定
 */
define(['N/record', 'N/search', 'N/url','N/runtime'],
    /**
     * @param{record} record
     * @param{search} search
     * @param{url} url
     */
    (record, search, url,runtime) => {
        /**
         * Defines the function definition that is executed before record is loaded.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @param {Form} scriptContext.form - Current form
         * @param {ServletRequest} scriptContext.request - HTTP request information sent from the browser for a client action only.
         * @since 2015.2
         */
        const beforeLoad = (scriptContext) => {
            if (scriptContext.type == 'view') {
                let newRec = scriptContext.newRecord;
                newRec = record.load({type: newRec.type, id: newRec.id});
                // let reconciliate_date = newRec.getText('custrecord_hc_glcb_reconciliate_date');
                //查找当前单据的明细行是不是已经全部对过账
              let isShow = verrifyRecordIsChecking(newRec.id);
                let form = scriptContext.form;
                if (isShow) {
                    let urlStr = url.resolveScript({
                        scriptId: 'customscript_xmh_sl_accounting_check',
                        deploymentId: 'customdeploy_xmh_sl_accounting_checkd_de',
                        params: {
                            recordId: newRec.id
                        }
                    })

                    let accountIngCheck = 'window.open("' + urlStr + '","_blank","width=1000,height=600")'
                    form.addButton({
                        id: 'custpage_account_checking',
                        label: '对账',
                        functionName: accountIngCheck
                    })
                }
            }

            if(scriptContext.type == 'edit'&&runtime.executionContext == 'USERINTERFACE'&&runtime.getCurrentUser().role!=3&&runtime.getCurrentUser().role!=1004){
                let newRec = scriptContext.newRecord;
                let isReceived = newRec.getValue('custrecord_hc_glcb_received');
                if(isReceived){
                    throw '单据已入库,不可修改'
                }
            }
        }
        const verrifyRecordIsChecking=(recId)=>{
            let costSearch =search.create({
                type:'customrecord_hc_global_logistics_cost',
                filters:[
                    ['custrecord_hc_glc_bill_order','anyof',recId],
                    'and',
                    ['isinactive','is','F'],
                    'and',
                    //['custrecord_hc_glc_bill_reconciliate','is','F'] //dzx 2023年7月22日19点40分 注释当前行
                    ['custrecord_hc_glc_vendor_bill', 'anyof', '@NONE@'] //dzx 2023年7月22日19点40分 添加代码
                ]
            });
            let rs = costSearch.run().getRange({start:0,end:1});
            if(rs.length>0){
                return true;
            }
            return  false;
        }

        /**
         * Defines the function definition that is executed before record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const beforeSubmit = (scriptContext) => {

        }

        /**
         * Defines the function definition that is executed after record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const afterSubmit = (scriptContext) => {
            if(scriptContext.type == 'create'||scriptContext.type == 'edit'||scriptContext.type == 'xedit'){
                let newRec = scriptContext.newRecord;
                newRec = record.load({type:newRec.type,id:newRec.id});
                let shippingOrderId = newRec.getValue('custrecord_hc_glcb_shipping_order');
                if(shippingOrderId){
                    for(let idx = 0;idx<5;idx++){
                        try{
                            record.submitFields({
                                type:'customrecord_hc_shipping_order',
                                id:shippingOrderId,
                                values:{
                                    custrecord_hc_gso_cost_bill:newRec.id
                                },
                                options:{
                                    ignoreMandatoryFields:true
                                }
                            })
                            break;
                        }catch (e) {
                            log.debug('e',e)

                        }

                    }

                }
            }

        }

        return {beforeLoad, /*beforeSubmit,*/ afterSubmit}

    });