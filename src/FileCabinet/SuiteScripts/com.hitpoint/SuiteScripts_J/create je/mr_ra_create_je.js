/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * version      date                user            memo
 * 1.0            2022.03.04     Josie           新建：售后申请单生成日记账
 */
define(['N/record', 'N/search', 'N/config', '../../account_params/account_params'],
    /**
     * @param{record} record
     * @param{search} search
     */
    (record, search, config, ap) => {
        function getAllSearchData(dsearch) {
            var run_search = dsearch.run();
            var all_datas = run_search.getRange({start: 0, end: 1000});
            var data_i = 1000;

            while (all_datas) {
                if (all_datas.length == data_i) {
                    var to_data_ex = run_search.getRange({start: data_i, end: data_i + 1000});
                    if (to_data_ex.length > 0) {
                        all_datas = all_datas.concat(to_data_ex);
                    }
                    data_i = data_i + 1000;
                } else {
                    break;
                }
            }
            return all_datas;
        }

        function isNull(value) {
            if (value == 'undefined' || value == undefined || value == '' || value == null || value == ' ' || Number(value) == 0) {
                return true;
            } else {
                return false;
            }
        }

        const getInputData = (inputContext) => {
            let searchId = 'customsearch_hc_rma_credit_je';
            let dSearch = search.load(searchId);
            let allDatas = getAllSearchData(dSearch);
            let executedArr = [];
            for (let i = 0; i < allDatas.length; i++) {
                executedArr.push({
                    recordType: allDatas[i].recordType,
                    id: allDatas[i].id,
                    subsidiary: allDatas[i].getValue('custrecord_hc_morma_subsidiary'),
                    currency: allDatas[i].getValue('custrecord_hc_morma_currency'),
                    trandate: allDatas[i].getValue('custrecord_hc_morma_create_date'),
                    customer: allDatas[i].getValue('custrecord_hc_morma_customer'),
                    department: allDatas[i].getValue(search.createColumn({
                        name: 'custentity_hc_customer_department',
                        join: 'custrecord_hc_morma_customer'
                    })),
                    rmaId: allDatas[i].getValue('custrecord_hc_morma_rma_id'),
                    profile: allDatas[i].getValue('custrecord_hc_morma_profile'),
                    detailsId: allDatas[i].getValue(search.createColumn({
                        name: 'internalid',
                        join: 'custrecord_hc_mori_header'
                    })),
                    fromOrder: allDatas[i].getText('custrecord_hc_morma_craeted_from'),
                    originalOrder: allDatas[i].getValue('custrecord_hc_morma_original_order_id'),
                    sellerSKu: allDatas[i].getValue(search.createColumn({
                        name: 'custrecord_hc_mori_sku',
                        join: 'custrecord_hc_mori_header'
                    })),
                });
            }
            return executedArr
        }

        function getInventoryAdjustMentTrandate(detailsId) {
            let iaSearch = search.create({
                type: 'inventoryadjustment',
                filters: [
                    ['mainline', 'is', 'F'],
                    'and',
                    ['taxline', 'is', 'F'],
                    'and',
                    ['custcol_hc_mo_return_items', 'anyof', detailsId]
                ],
                columns: [
                    search.createColumn({
                        name: 'trandate',
                        sort: search.Sort.DESC
                    })
                ]
            });
            let rs = iaSearch.run().getRange({start: 0, end: 1});
            if (rs.length > 0) {
                return rs[0].getValue(search.createColumn({name: 'trandate', sort: search.Sort.DESC}))
            }
            return '';
        }

        function getCostInfo(ramIdArr) {
            let info = {};
            let dFilters = [
                ['isinactive', 'is', 'F'],
                'and',
                ['custrecord_hc_skucm_transaction_type', 'anyof', '2'],
                'and',
                ['custrecord_hc_skucm_order_line', 'is', ramIdArr]
            ];

            let costSearch = search.create({
                type: 'customrecord_hc_sku_revenue_cost_cm',
                filters: dFilters,
                columns: [
                    'custrecord_hc_skucm_level',
                    search.createColumn({
                        name: 'class',
                        join: 'custrecord_hc_skucm_inventory_item'
                    }),
                    'custrecord_hc_skucm_inventory_item',
                    'custrecord_hc_skucm_fxamount',
                    'custrecord_hc_skucm_taxamount',
                    'custrecord_hc_skucm_quantity_recognized',
                    'custrecord_hc_skucm_revenue_recognized',
                    'custrecord_hc_skucm_tax_recognized',

                ]
            });
            let allDatas = getAllSearchData(costSearch);
            let dColumns = costSearch.columns;
            for (let i = 0; i < allDatas.length; i++) {
                let level = allDatas[i].getValue(dColumns[0]);
                if (isNull(info[level])) {
                    info[level] = [];
                }
                info[level].push({
                    costId: allDatas[i].id,
                    itemClass: allDatas[i].getValue(dColumns[1]),
                    item: allDatas[i].getValue(dColumns[2]),
                    fxamount: allDatas[i].getValue(dColumns[3]),
                    taxamount: allDatas[i].getValue(dColumns[4]),
                    quantityRecognized: allDatas[i].getValue(dColumns[5]),  //数量确认
                    revenueRecognized: allDatas[i].getValue(dColumns[6]),    //收入确认
                    taxRecognized: allDatas[i].getValue(dColumns[7]),//税金确认
                });
            }
            return info;
        }
        function getTaxAccountId(customId){
            let dSearch = search.create({
                type:'customrecord_hc_seller_profile',
                filters:[
                    ['isinactive','is','F'],
                    'and',
                    ['custrecord_hc_sp_customer','anyof',customId],
                    'and',
                    ['custrecord_hc_sp_tax_account','noneof,"@NONE@']
                ],
                columns:['custrecord_hc_sp_tax_account']
            })
            let rs = dSearch.run().getRange({start:0,end:1});
            if(rs.length>0){
                return rs[0].getValue('custrecord_hc_sp_tax_account')
            }
            return  '';
        }

        function getTaxAccount(subId,entity) {
            let accountId = getTaxAccountId(entity);
            if(accountId == ''){
                if (Number(subId) == ap.get_account_param('CONST_BPO_INC_SUBSIDIARY')||Number(subId) == ap.get_account_param('CONST_BWK_SUBSIDIARY')) {
                    accountId = ap.get_account_param('CONST_FO_CREDIT_ACCOUNT_BPI')
                }else {
                    accountId = ap.get_account_param('CONST_FO_CREDIT_ACCOUNT')
                }
            }
            return accountId;
            // let taxSearch = search.create({
            //     type: 'salestaxitem',
            //     filters: [
            //         ['isinactive', 'is', 'F'],
            //         'and',
            //         ['subsidiary', 'anyof', subId],
            //         'and',
            //         [['availableon','anyof','BOTH'],'OR',['availableon','anyof','@NONE@']],
            //         'and',
            //         ['saleaccount','noneof','@NONE@']
            //     ],
            //     columns: [
            //         'saleaccount'
            //     ]
            // });
            // let rs = taxSearch.run().getRange({start:0,end:1});
            // if(rs.length>0){
            //     return rs[0].getValue('saleaccount');
            // }
            // return  ''
        }

        const map = (mapContext) => {
            let jeId = '';
            let mapObj = JSON.parse(mapContext.value);
            log.debug('mapObj', mapObj);
            let raRec = record.load({type: 'customrecord_hc_mo_return_items', id: mapObj.detailsId});
            try {
                let costIdArr = [];
                //查找明细行生成的最后一张库存调整单的日期
                mapObj.trandate = getInventoryAdjustMentTrandate(mapObj.detailsId);
                //校验必填
                if (isNull(mapObj.subsidiary)) {
                    throw '附属子公司无值，请检查'
                }
                if (isNull(mapObj.currency)) {
                    throw '币种无值，请检查'
                }
                if (isNull(mapObj.trandate)) {
                    throw '申请时间无值，请检查'
                }
                let rmaLineArr = mapObj.detailsId;

                //获取借贷方科目
                let sysRec = config.load({type: config.Type.ACCOUNTING_PREFERENCES});
                let debitAccount = sysRec.getValue('INCOMEACCOUNT');
                let creditAccount = sysRec.getValue('ARACCOUNT');
                //查找第二个借方科目
                let taxAccount = getTaxAccount(mapObj.subsidiary,mapObj.customer);
                if (taxAccount == '') {
                    throw  '税额借方科目不存在'
                }

                let jeRec = record.create({type: 'journalentry', isDynamic: true});
                jeRec.setValue({fieldId: 'subsidiary', value: mapObj.subsidiary});
                jeRec.setValue({fieldId: 'currency', value: mapObj.currency});
                jeRec.setText({fieldId: 'trandate', text: mapObj.trandate});
                jeRec.setValue({fieldId: 'approvalstatus', value: 2});
                jeRec.setValue({fieldId: 'custbody_hc_je_financial_type', value: 5});

                let costInfo = getCostInfo(rmaLineArr);
                log.debug('costInfo', costInfo);
                let arr = costInfo[2];
                if (arr == undefined || arr == 'undefined' || arr == '' || arr.length == 0) {
                    arr = costInfo[1];
                }
                //log.debug('arr', arr);
                for (let index = 0; index < arr.length; index++) {
                    costIdArr.push(arr[index].costId);
                    //每个商品经营表生成多借一贷
                    let debitAmt = arr[index].fxamount;
                    if (Number(debitAmt) != 0) {
                        //第一个借
                        jeRec.selectNewLine({sublistId: 'line'});
                        jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'account', value: debitAccount});
                        jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'debit', value: debitAmt});
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'memo',
                            value: mapObj.fromOrder + mapObj.originalOrder + '售后贷项'
                        });
                        jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'entity', value: mapObj.customer});
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'department',
                            value: mapObj.department
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'class',
                            value: arr[index].itemClass
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_seller_sku',
                            value: mapObj.sellerSKu
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_platform_original_order_id',
                            value: mapObj.rmaId
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'cseg_hc_salechannel',
                            value: mapObj.profile
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_fulfill_item',
                            value: arr[index].item
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_from_rma',
                            value: mapObj.id
                        });
                        jeRec.commitLine({sublistId: 'line'});
                    }

                    let amt = arr[index].taxamount;
                    //第二个借
                    if (Number(amt) != 0) {
                        jeRec.selectNewLine({sublistId: 'line'});
                        jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'account', value: taxAccount});
                        jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'debit', value: amt});
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'memo',
                            value: mapObj.fromOrder + mapObj.originalOrder + '售后贷项'
                        });
                        jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'entity', value: mapObj.customer});
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'department',
                            value: mapObj.department
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'class',
                            value: arr[index].itemClass
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_seller_sku',
                            value: mapObj.sellerSKu
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_platform_original_order_id',
                            value: mapObj.rmaId
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'cseg_hc_salechannel',
                            value: mapObj.profile
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_fulfill_item',
                            value: arr[index].item
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_from_rma',
                            value: mapObj.id
                        });
                        jeRec.commitLine({sublistId: 'line'});
                        debitAmt = accAdd(Number(debitAmt), Number(amt));
                    }
                    if (Number(debitAmt) != 0) {


                        //贷方
                        jeRec.selectNewLine({sublistId: 'line'});
                        jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'account', value: creditAccount});
                        jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'credit', value: debitAmt});
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'memo',
                            value: mapObj.fromOrder + mapObj.originalOrder + '售后贷项'
                        });
                        jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'entity', value: mapObj.customer});
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'department',
                            value: mapObj.department
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'class',
                            value: arr[index].itemClass
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_seller_sku',
                            value: mapObj.sellerSKu
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_platform_original_order_id',
                            value: mapObj.rmaId
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'cseg_hc_salechannel',
                            value: mapObj.profile
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_fulfill_item',
                            value: arr[index].item
                        });
                        jeRec.setCurrentSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_from_rma',
                            value: mapObj.id
                        });
                        jeRec.commitLine({sublistId: 'line'});
                    }
                }
                let jeLineCount = jeRec.getLineCount('line');
                if(jeLineCount>0){
                    jeId = jeRec.save({ignoreMandatoryFields: true});
                }
                for (let i = 0; i < costIdArr.length; i++) {
                    mapContext.write({
                        key: costIdArr[i],
                        value: jeId
                    })
                }
                // log.debug('日记账',jeId)
            } catch (e) {
                log.debug('map-e', e);
                if (jeId != '') {
                    record.delete({type: 'journalentry', id: jeId});
                    jeId = '';
                }
            }
            raRec.setValue({fieldId: 'custrecord_hc_mori_credit_je', value: jeId});
            raRec.save({ignoreMandatoryFields: true});
        }

        function reduce(reduceContext) {
            let key = reduceContext.key;
            let values = reduceContext.values;
            log.debug(key, values)
            let jeId = values[0];
            try {
                for(let i = 0;i<5;i++){
                    try{
                        let rec = record.load({type: 'customrecord_hc_sku_revenue_cost_cm', id: key});
                        let qty = rec.getValue('custrecord_hc_skucm_quantity');
                        let fxamount = rec.getValue('custrecord_hc_skucm_fxamount');
                        let taxamount = rec.getValue('custrecord_hc_skucm_taxamount');
                        //log.debug('111','qty='+qty+'fxamount='+fxamount+'taxamount='+taxamount)
                        rec.setValue({fieldId: 'custrecord_hc_skucm_quantity_recognized', value: accMul(-1, Number(qty))});
                        rec.setValue({fieldId: 'custrecord_hc_skucm_revenue_recognized', value: accMul(-1, Number(fxamount))});
                        rec.setValue({fieldId: 'custrecord_hc_skucm_tax_recognized', value: accMul(-1, Number(taxamount))});
                        rec.save({ignoreMandatoryFields: true});
                        break;
                    }catch (e){
                        log.debug('e',e)
                    }

                }

            } catch (e) {
                log.debug('reduce-e', e);
                if(jeId){
                    record.delete({type: 'journalentry', id: jeId});
                }


            }

        }

        const summarize = (summaryContext) => {
            log.debug('结束')

        }

        function accAdd(arg1, arg2) {
            var r1, r2, m, c;
            try {
                r1 = arg1.toString().split(".")[1].length
            } catch (e) {
                r1 = 0
            }
            try {
                r2 = arg2.toString().split(".")[1].length
            } catch (e) {
                r2 = 0
            }
            c = Math.abs(r1 - r2);
            m = Math.pow(10, Math.max(r1, r2))
            if (c > 0) {
                var cm = Math.pow(10, c);
                if (r1 > r2) {
                    arg1 = Number(arg1.toString().replace(".", ""));
                    arg2 = Number(arg2.toString().replace(".", "")) * cm;
                } else {
                    arg1 = Number(arg1.toString().replace(".", "")) * cm;
                    arg2 = Number(arg2.toString().replace(".", ""));
                }
            } else {
                arg1 = Number(arg1.toString().replace(".", ""));
                arg2 = Number(arg2.toString().replace(".", ""));
            }
            return (arg1 + arg2) / m
        }

        function accMul(arg1, arg2) {
            var m = 0, s1 = arg1.toString(), s2 = arg2.toString();
            try {
                m += s1.split(".")[1].length
            } catch (e) {
            }
            try {
                m += s2.split(".")[1].length
            } catch (e) {
            }
            return Number(s1.replace(".", "")) * Number(s2.replace(".", "")) / Math.pow(10, m)
        }

        return {getInputData, map, reduce, summarize}

    });
