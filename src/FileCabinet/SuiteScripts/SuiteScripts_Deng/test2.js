/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
*/
 define(['N/record', 'N/currency', 'N/search'],
    function(record, currency, search) {

        function onRequest(context) {
            try{
                let rec = record.load({
                    type: 'journalentry',
                    id: 1490662
                });
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
                            sku: shipOrderRec.getSublistValue(lineCol, 'custrecord_hc_cpl_item', i),
                            price: shipOrderRec.getSublistValue(lineCol, 'custrecord_hc_cpl_unit_rate', i),
                            quantity: shipOrderRec.getSublistValue(lineCol, 'custrecord_hc_cpl_item_load_quantity', i),
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
                                        if(ft_obj.ft_amount == 0) {
                                            objArray[i].debit = ft_obj.ft_amount;
                                        }
                                        if(objArray[i - 1].sku == ft_obj.sku) {
                                            objArray[i - 1].debit = ft_obj.ft_amount;
                                            if(ft_obj.ft_amount == 0) {
                                                objArray[i - 1].credit = ft_obj.ft_amount;
                                            }
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
                    rec.setSublistValue({
                        sublistId: 'line',
                        fieldId: 'credit',
                        value: je_line_obj.credit,
                        line: i
                    });
                    rec.setSublistValue({
                        sublistId: 'line',
                        fieldId: 'debit',
                        value: je_line_obj.debit,
                        line: i
                    });
                }
                rec.save();
    
                //获取库存调整明细
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
                        quantity: ia_rec.getSublistValue(ia_line_col, 'adjustqtyby', i),
                        //到岸成本明细
                        landed_id: ia_rec.getSublistValue(ia_line_col, 'custcol_hc_landed_cost_record', i),
                        //公司转让价
                        tran_price: ia_rec.getSublistValue(ia_line_col, 'custcol_hc_intercompany_transferprice', i),
                        //到岸成本
                        landed_cost: 0
                    }
                }
                //根据头程费用分摊库调整到岸成本上
                for (let key in ft_amount_obj) {
                    for (var i = 0 ; i < ft_amount_obj[key].length ; i++) {
                        let ft_a_o = ft_amount_obj[key][i];
                        for (var l = 0 ; l < ia_line_array.length ; l++) {
                            if(ft_a_o.sku == ia_line_array[l].sku) {
                                let d_amount = Number(ft_a_o.ft_amount) / Number(ia_line_array[l].quantity);
                                let col = key == '关税' ? 'custrecord_hc_scar_duty_charges_by_unit' :
                                    key == '头程运费' ? 'custrecord_hc_scar_freight_by_unit' :
                                    key == '报关费' ? 'custrecordhc_scar_customcharges_by_unit' :
                                    key == '提货费' ? 'custrecord_hc_scar_bill_fee_by_unit' : 'custrecord_hc_scar_other_fees_by_unit';
                                    // key == '杂费' ? 'custrecord_hc_scar_other_fees_by_unit' : '';
                                ia_line_array[l].landed_cost = Number(Number(ia_line_array[l].landed_cost) + (d_amount)).toFixed(2);
                                ia_line_array[l].price = ft_a_o.price;
                                ia_line_array[l][col] = Number(d_amount).toFixed(2);
                            }
                        }
                    }
                }
                log.debug('ia_line_array', ia_line_array);
                for (let i = 0 ; i < ia_line_array.length; i++) {
                    let ia_line_obj = ia_line_array[i];
                    // let line = Number(ia_line_obj['line']) - 1;
                    let line = i;
                    //到岸成本 + 单价 + 公司间转让价 = 估计单位成本
                    let cb_price = Number(Number(ia_line_obj.landed_cost) + Number(ia_line_obj.price) + Number(ia_line_obj.tran_price)).toFixed(2);
                    //到岸成本
                    ia_rec.setSublistValue(ia_line_col, 'custcol_hc_landed_cost', line, ia_line_obj.landed_cost);
                    //估计单位成本
                    ia_rec.setSublistValue(ia_line_col, 'unitcost', line, cb_price);
                    
                    let sub_obj = {};
                    sub_obj.custrecord_hc_scar_total_by_unit = ia_line_obj.landed_cost;
                    for (let key in ia_line_obj) {
                        if (key.indexOf('custrecord') != -1) {
                            sub_obj[key] = ia_line_obj[key];
                        }
                    }
                    record.submitFields({type: 'customrecord_hc_sku_costallocationresult', id: ia_line_obj.landed_id, values: sub_obj});
                }
                ia_rec.save();
                record.submitFields({
                    type: 'customrecord_hc_shipping_order', 
                    id: rec.getValue('custbody_hc_applied_shipping_order'), 
                    values: {
                        custrecord_hc_data_point: ''
                    }
                });
            }catch(e) {
                log.debug('error', e.message + e.stack);
            }
        }

        return {
            onRequest: onRequest
        };
     }
);