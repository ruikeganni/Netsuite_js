/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * Task                       Date
 * Calculate JE amount      20230707
*/
 define(['N/record'],
    (record) => {
        const beforeLoad = (context) => {

        }
        
        const afterSubmit = (context) => {
            try{
                if(context.type == 'delete' || context.type == 'xedit') {
                    return;
                }
                let rec = context.newRecord;
                log.debug('GLB', rec.getValue('custbody_hc_logistics_bill'));
                log.debug('GSO', rec.getText('custbody_hc_applied_shipping_order'));
    
                //获取日记账货品金额
                let objArray = [];
                let line_col = 'line';
                let lineCount = rec.getLineCount(line_col);
                for(var i = 0 ; i < lineCount ; i++) {
                    objArray[rec.getSublistValue(line_col, line_col, i)] = {
                        account: rec.getSublistValue(line_col, 'account', i),
                        sku: rec.getSublistValue(line_col, 'custcol_hc_fulfill_item', i),
                        credit: rec.getSublistValue(line_col, 'credit', i),
                        debit: rec.getSublistValue(line_col, 'debit', i),
                        memo: rec.getSublistValue(line_col, 'memo', i)
                    }
                }
    
                //获取头程物流费用账单金额及货币
                let glbRec = record.load({
                    type: 'customrecord_hc_global_logistics_bill',
                    id: rec.getValue('custbody_hc_logistics_bill')
                });
                let glbAmount = {};
                let glb_line_col = 'recmachcustrecord_hc_glc_bill_order';
                let glbLineCount = glbRec.getLineCount(glb_line_col);
                for(var i = 0 ; i < glbLineCount ; i++) {
                    if(!glbRec.getSublistValue(glb_line_col, 'custrecord_hc_glc_allocation', i)) {
                        continue;
                    }
                    let cur = glbRec.getSublistValue(glb_line_col, 'custrecord_hc_glc_currency', i);
                    let rate = currency.exchangeRate({source: cur, target: rec.getValue('currency'), date: glbRec.getSublistValue(glb_line_col, 'custrecord_hc_glc_bill_check_date', i)});
                    let amount = glbRec.getSublistValue(glb_line_col, 'custrecord_hc_glc_estimated_cost', i);
                    glbAmount[glbRec.getSublistText(glb_line_col, 'custrecord_hc_glc_cost_type', i)] = {
                        //录入金额
                        amount : amount,
                        //货币
                        cur: glbRec.getSublistText(glb_line_col, 'custrecord_hc_glc_currency', i),
                        //税率
                        rate : rate,
                        //换算成本位币后的金额
                        amountRate : Number(amount*rate).toFixed(2),
                        //分摊规则
                        ftgz : glbRec.getSublistValue(glb_line_col, 'custrecord_hc_glc_allocation_rule', i),
                        //分摊总值
                        total_ft : 0
                    }
                }
    
                //根据国际头程运单计算货品金额
                let shipOrderRec = record.load({
                    type: 'customrecord_hc_shipping_order',
                    id: rec.getValue('custbody_hc_applied_shipping_order')
                });
                let lineCol = 'recmachcustrecord_hc_cpl_shipping_order';
                let shipOrderLineCount = shipOrderRec.getLineCount(lineCol);
                var ft_amount_obj = {};
                // [数量：1，体积：2，重量：3，计费重量：4，货值：5]
                for(var key in glbAmount) {
                    let amountObj = glbAmount[key];
                    let col = amountObj.ftgz === '1'? 'custrecord_hc_cpl_item_shiped_quantity':
                        amountObj.ftgz=== '2' ? 'custrecord_hc_cpl_total_volume':
                        amountObj.ftgz=== '3' ? 'custrecord_hc_cpl_total_weight':
                        amountObj.ftgz=== '4' ? '':
                        amountObj.ftgz=== '5' ? 'custrecord_hc_cpl_total_value': '';
                    
                    for(var i = 0 ; i < shipOrderLineCount ; i++) {
                        glbAmount[key].total_ft = Number(glbAmount[key].total_ft) + Number(shipOrderRec.getSublistValue(lineCol, col, i));
                    }

                    let x = glbAmount[key].amountRate/glbAmount[key].total_ft;
                    let total_ft = Number(0);
                    let ft_amount_array = [];
                    for(var i = 0 ; i < shipOrderLineCount ; i++) {
                        var ft_amount = Number(shipOrderRec.getSublistValue(lineCol, col, i) * x).toFixed(2);
                        total_ft = Number(total_ft) + Number(ft_amount);
                        ft_amount_array[ft_amount_array.length] = {
                            sku : shipOrderRec.getSublistValue(lineCol, 'custrecord_hc_cpl_item', i),
                            ft_amount : Number(ft_amount)
                        };
                    }
                    //计算出差异添加在最后行
                    var cy_amount = Number(Number(glbAmount[key].amountRate) - Number(total_ft).toFixed(2)).toFixed(2);
                    log.debug(key, '差异：' + cy_amount);
                    if(cy_amount) {
                        ft_amount_array[ft_amount_array.length-1].ft_amount = Number(ft_amount_array[ft_amount_array.length-1].ft_amount) + Number(cy_amount);
                    }
                    ft_amount_obj[key] = ft_amount_array;
                }
                log.debug('glbAmount', glbAmount);
                log.debug('ft_amount_obj', ft_amount_obj);

                //按照SKU备注将分摊的金额映射到日记账行上
                for(var i = 0 ; i < objArray.length ; i++) {
                    let je_line_obj = objArray[i];
                    let memo = je_line_obj.memo;
                    if(memo && memo != '') {
                        for(var key in ft_amount_obj) {
                            let ft_Array = ft_amount_obj[key];
                            if(memo.indexOf(key) != -1) {
                                for(var l in ft_Array) {
                                    let ft_obj = ft_Array[l];
                                    if(ft_obj.sku == je_line_obj.sku) {
                                        objArray[i].credit = ft_obj.ft_amount;
                                        if(objArray[i - 1].sku == ft_obj.sku) {
                                            objArray[i - 1].debit = ft_obj.ft_amount;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                log.debug('JE_line', objArray);
                for(var i = 0 ; i < objArray.length ; i++) {
                    let je_line_obj = objArray[i];
                    let col = je_line_obj.credit ? 'credit' : 'debit';
                    let amount = je_line_obj.credit ? je_line_obj.credit : je_line_obj.debit;
                    rec.setSublistValue({
                        sublistId: 'line',
                        fieldId: col,
                        value: amount,
                        line: i
                    });
                }

                //获取库存调整所有明细数据
                let ia_rec = record.load({
                    type: 'inventoryadjustment',
                    id: rec.getValue('custbody_hc_create_from_ia')
                });
                let ia_line_array = [];
                let ia_line_col = 'inventory';
                let ia_line_count = ia_rec.getLineCount(ia_line_col);
                for(let i = 0 ; i < ia_line_count ; i++) {
                    ia_line_array[ia_line_array.length] = {
                        line: ia_rec.getSublistValue(ia_line_col, 'line', i),
                        sku: ia_rec.getSublistValue(ia_line_col, 'item', i),
                        unitcost: ia_rec.getSublistValue(ia_line_col, 'unitcost', i),
                        quantity: ia_rec.getSublistValue(ia_line_col, 'newquantity', i)
                    }
                }
                log.debug('ia_line_array', ia_line_array);


            } catch(e) {
                log.debug('e', e.message + e.stack);
            }
        }
        
        const beforeSubmit = (context) => {
            
        }

        return {
            beforeLoad : beforeLoad,
            afterSubmit : afterSubmit,
            beforeSubmit : beforeSubmit
        }
   }
)