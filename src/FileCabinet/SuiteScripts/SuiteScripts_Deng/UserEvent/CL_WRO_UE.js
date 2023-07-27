/**
 * 入库委托单|UE
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
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
                type: 'customrecord_hc_warehouse_receive_order',
                id: rec.id
            });
            var skuShipNo = {};
            if(rec.getValue('custrecord_hc_wro_shipment_plan')){
                var planRec = record.load({
                    type: 'customrecord_hc_shipment_plan_order',
                    id: rec.getValue('custrecord_hc_wro_shipment_plan')
                });
                var planItemCount = planRec.getLineCount('recmachcustrecord_hc_spoi_header');
                for(var i = 0; i < planItemCount; i++){
                    skuShipNo[planRec.getSublistValue('recmachcustrecord_hc_spoi_header', 'custrecord_hc_spoi_item', i)] = planRec.getSublistValue('recmachcustrecord_hc_spoi_header', 'custrecord_hc_spoi_factory_shipment_no', i);
                }
            }
            log.debug('skuShipNo', skuShipNo);
            var itemLineCount = shipPlanRec.getLineCount('recmachcustrecord_hc_sc_header');
            for(var i = 0 ; i < itemLineCount ; i++){
                var poId = shipPlanRec.getSublistValue('recmachcustrecord_hc_sc_header', 'custrecord_hc_sc_po', i);
                if(poId){
                    var poSearch = search.lookupFields({
                        type: record.Type.PURCHASE_ORDER,
                        id: poId,
                        columns: ['custbody_hc_factory_sales_order_no']
                    });
                    log.debug('工厂销售订单号', 'PO:'+poId+':'+poSearch.custbody_hc_factory_sales_order_no);
                    shipPlanRec.setSublistValue('recmachcustrecord_hc_sc_header', 'custrecord_wro_factory_sales_order_no', i, poSearch.custbody_hc_factory_sales_order_no);
                }
                //custrecord_hc_wro_factory_shipment_no 工厂出库单号
                if(skuShipNo[shipPlanRec.getSublistValue('recmachcustrecord_hc_sc_header', 'custrecord_hc_sc_item', i)]){
                    shipPlanRec.setSublistValue('recmachcustrecord_hc_sc_header', 'custrecord_hc_wro_factory_shipment_no', i, skuShipNo[shipPlanRec.getSublistValue('recmachcustrecord_hc_sc_header', 'custrecord_hc_sc_item', i)]);
                }
            }
            //国际头程运单取 柜号
            if(rec.getValue('custrecord_hc_wro_gso')){
                var wroRec = search.lookupFields({
                    type:'customrecord_hc_shipping_order',
                    id: rec.getValue('custrecord_hc_wro_gso'),
                    columns: ['custrecord_hc_gso_container_no']
                });
                shipPlanRec.setValue('custrecord_wro_container_no', wroRec.custrecord_hc_gso_container_no);
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
