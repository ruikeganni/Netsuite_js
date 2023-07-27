/**
 * 发货计划|UE
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/record', 'N/search'], 
function(record, search) {

    function beforeLoad(context) {
        
    }

    function beforeSubmit(context) {
        
    }

    function afterSubmit(context) {
        try{
            var rec = context.newRecord;
            var shipPlanRec = record.load({
                type: 'customrecord_hc_shipment_plan_order',
                id: rec.id
            });
            var itemLineCount = shipPlanRec.getLineCount('recmachcustrecord_hc_spoi_header');
            for(var i = 0 ; i < itemLineCount ; i++){
                var poId = shipPlanRec.getSublistValue('recmachcustrecord_hc_spoi_header', 'custrecord_hc_spoi_po_number', i);
                if(poId){
                    var poSearch = search.lookupFields({
                        type: record.Type.PURCHASE_ORDER,
                        id: poId,
                        columns: ['custbody_hc_factory_sales_order_no']
                    });
                    log.debug('工厂销售订单号', 'PO:'+poId+':'+poSearch.custbody_hc_factory_sales_order_no);
                    shipPlanRec.setSublistValue('recmachcustrecord_hc_spoi_header', 'custrecord_shipplan_factorysales_orderid', i, poSearch.custbody_hc_factory_sales_order_no);
                }
            }
            shipPlanRec.save();
        }catch(e){
            log.debug('error', e.message+ ';' +e.stack);
        }
    }

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    }
});
