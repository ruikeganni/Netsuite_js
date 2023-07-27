/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *  version      date                user            memo
 * 1.0           2022.03.14     Josie           新建：对账页面
 */
define(['N/record', 'N/search', 'N/ui/serverWidget', 'N/redirect', 'N/url', '../../account_params/account_params'],

    (record, search, sw, redirect, url, ap) => {
        /**
         * Defines the Suitelet script trigger point.
         * @param {Object} scriptContext
         * @param {ServerRequest} scriptContext.request - Incoming request
         * @param {ServerResponse} scriptContext.response - Suitelet response
         * @since 2015.2
         */
        const onRequest = (scriptContext) => {
            let request = scriptContext.request;
            let response = scriptContext.response;
            let params = request.parameters;
            let method = request.method;
            log.debug('params', params)
            if (method == 'GET') {
                let rec = record.load({type: 'customrecord_hc_global_logistics_bill', id: params.recordId});
                let spId = rec.getValue('custrecord_hc_glcb_shipping_order');

                //查找运单出货明细行上的装柜清单
                let cpIdArr = getPackingOrder(spId);
                let form = sw.createForm({title: '头程物流费用对账'});
                form.clientScriptModulePath = './cs_check_field_has_value.js';
                form.addSubmitButton({label: '确认'})
                form.addField({
                    id: 'custpage_record_id',
                    label: '记录id',
                    type: 'text'
                }).updateDisplayType({displayType: sw.FieldDisplayType.HIDDEN}).defaultValue = params.recordId;
                form.addField({
                    id: 'custpage_sp_rec',
                    label: '运单',
                    type: 'select',
                    source: 'customrecord_hc_shipping_order'
                }).updateDisplayType({displayType: sw.FieldDisplayType.DISABLED}).defaultValue = spId;
                form.addField({
                    id: 'custpage_booking_no',
                    label: 'Booking No.',
                    type: 'multiselect',
                    source: 'customrecord_hc_container_packing_order'
                }).updateBreakType({breakType: sw.FieldBreakType.STARTCOL}).updateDisplayType({displayType: sw.FieldDisplayType.DISABLED}).defaultValue = cpIdArr;
                // form.addField({
                //     id: 'custpage_date',
                //     label: '对账日期',
                //     type: 'date'
                // }).updateBreakType({breakType: sw.FieldBreakType.STARTCOL}).isMandatory = true;
                form.addTab({id: 'custpage_tab', label: ' '});
                let mySublist = form.addSublist({
                    id: 'custpage_results',
                    type: sw.SublistType.LIST,
                    tab: 'custpage_tab',
                    label: ' '
                });
                mySublist.addField({
                    id: 'custpage_list_chengben',
                    type: 'select',
                    label: '登岸成本项',
                    source: 'customrecord_hc_logistic_landed_cost'
                }).updateDisplayType({displayType: sw.FieldDisplayType.HIDDEN});
                mySublist.addField({
                    id: 'custpage_list_chengben_str',
                    type: 'text',
                    label: '登岸成本项'
                }).updateDisplayType({displayType: sw.FieldDisplayType.DISABLED});
                mySublist.addField({
                    id: 'custpage_list_estimated_cost',
                    type: 'float',
                    label: '预估费用',
                }).updateDisplayType({displayType: sw.FieldDisplayType.DISABLED});
                let actField = mySublist.addField({
                    id: 'custpage_list_act_cost',
                    type: 'float',
                    label: '实际费用<span style="color: #c77f02;font-weight: bolder">  *</span>',
                }).updateDisplayType({displayType: sw.FieldDisplayType.ENTRY});
                //actField.isMandatory = true;
                // actField.updateDisplaySize({
                //     height:10,
                //     width:50
                // })

                mySublist.addField({
                    id: 'custpage_list_date',
                    type: 'date',
                    label: '对账日期',
                }).updateDisplayType({displayType: sw.FieldDisplayType.ENTRY});

                mySublist.addField({
                    id: 'custpage_list_forwarder',
                    type: 'select',
                    label: '收款方',
                    source: 'vendor'
                }).updateDisplayType({displayType: sw.FieldDisplayType.HIDDEN});
                mySublist.addField({
                    id: 'custpage_list_currency',
                    type: 'select',
                    label: '币种',
                    source: 'currency'
                }).updateDisplayType({displayType: sw.FieldDisplayType.HIDDEN});
                mySublist.addField({
                    id: 'custpage_list_subsidiary',
                    type: 'select',
                    label: '附属公司',
                    source: 'subsidiary'
                }).updateDisplayType({displayType: sw.FieldDisplayType.HIDDEN});
                mySublist.addField({
                    id: 'custpage_list_subsidiary_str',
                    type: 'text',
                    label: '附属公司名称'
                }).updateDisplayType({displayType: sw.FieldDisplayType.HIDDEN});
                mySublist.addField({
                    id: 'custpage_list_id',
                    type: 'select',
                    label: '头程物流费用',
                    source: 'customrecord_hc_global_logistics_cost'
                }).updateDisplayType({displayType: sw.FieldDisplayType.HIDDEN});
                mySublist.addField({
                    id: 'custpage_list_first_account',
                    type: 'select',
                    label: '入库资产科目',
                    source: 'account'
                }).updateDisplayType({displayType: sw.FieldDisplayType.HIDDEN});
                mySublist.addField({
                    id: 'custpage_list_second_account',
                    type: 'select',
                    label: '出库还原科目',
                    source: 'account'
                }).updateDisplayType({displayType: sw.FieldDisplayType.HIDDEN});
                mySublist.addField({
                    id: 'custpage_list_vend_sub',
                    type: 'select',
                    label: '供应商子公司',
                    source: 'subsidiary'
                }).updateDisplayType({displayType: sw.FieldDisplayType.HIDDEN});
                //查找需要对账的头程物流费用
                let allDatas = getCost(params.recordId);
                log.debug('allDatas', allDatas);
                for (let i = 0; i < allDatas.length; i++) {
                    let subObj = allDatas[i];
                    for (var key in subObj) {
                        if (subObj[key] != '' && subObj[key] != null) {
                            mySublist.setSublistValue({id: key, value: subObj[key], line: i});
                        }
                    }
                }
                response.writePage(form);
            } else {
                let billIdArr = [];
                try {
                    //获取供应商上的子公司
                    let vendSub = getVendorSubsidiary();
                    //log.debug('vendSub',vendSub)
                    let submitArr = getSubmitInformation(params, request);
                    log.debug('submitArr', submitArr);
                    let costRec = record.load({
                        type: 'customrecord_hc_global_logistics_bill',
                        id: params.custpage_record_id
                    });
                    let feeSubsidiary = costRec.getValue('custrecord_hc_glcb_fee_subsidiary');//费用承担公司
                    let representingcustomer = '';
                    let representingvendor = '';
                    if (feeSubsidiary) {
                        let subRec = search.lookupFields({
                            type: 'subsidiary',
                            id: feeSubsidiary,
                            columns: ['representingcustomer', 'representingvendor']
                        });
                        // log.debug('subRec',subRec)
                        if (subRec && subRec.representingcustomer && subRec.representingcustomer.length > 0) {
                            representingcustomer = subRec.representingcustomer[0].value;
                        }
                        if (subRec && subRec.representingvendor && subRec.representingvendor.length > 0) {
                            representingvendor = subRec.representingvendor[0].value;
                        }
                    }
                    let feeSubsidiaryStr = costRec.getText('custrecord_hc_glcb_fee_subsidiary');//费用承担公司

                    let actJson = {};
                    let shippingOrder = costRec.getText('custrecord_hc_glcb_shipping_order');
                    let spOrderId = costRec.getValue('custrecord_hc_glcb_shipping_order');
                    for (let idx = 0; idx < submitArr.length; idx++) {
                        let subObj = submitArr[idx];
                        if (vendSub[subObj.entity].indexOf(subObj.subsidiary) == -1) {
                            throw  '供应商子公司和付款主体不一致';
                        }
                        let amt1 = 0;
                        let amt = 0;
                        let firstAccount = '';
                        let secondAccount = '';
                        let memoStr = '';
                        //头程物流费用账单记录上的字段“费用承担公司 ”和关联子记录头程物流费用的字段“付款主体 ”是否一致
                        if (Number(subObj.subsidiary) == Number(feeSubsidiary)) {
                            //一致时按明细行创建账单
                            amt1 = subObj.estimatedCost;
                            amt = Subtr(Number(subObj.actCost), Number(subObj.estimatedCost));
                            firstAccount = subObj.firstAccount;
                            secondAccount = subObj.secondAccount;
                            memoStr = shippingOrder + ' ' + subObj.chengBenStr;
                        } else {
                            //不一致时按头程物流费用行创建账单和日记账
                            amt1 = subObj.actCost;
                            amt = 0;
                            firstAccount = ap.get_account_param('CONST_OTHER_INTERNAL_RECEIVABLES');
                            memoStr = subObj.subsidiaryStr + ' 代付 ' + feeSubsidiaryStr + ' ' + shippingOrder + '头程物流费用';
                        }
                        let billId = createBillRecord(subObj, params, shippingOrder, amt1, amt, firstAccount, secondAccount, memoStr, representingcustomer, spOrderId);
                        billIdArr.push({recordType: 'vendorbill', id: billId});
                        let jeId = '';
                        if (Number(subObj.subsidiary) != Number(feeSubsidiary)) {
                            jeId = createJournalRecord(subObj, feeSubsidiary, shippingOrder, spOrderId, feeSubsidiaryStr);
                            billIdArr.push({recordType: 'journalentry', id: jeId});
                        }
                        actJson[subObj.costId] = {
                            cost: subObj.actCost,
                            billId: billId,
                            jeId: jeId,
                            date: subObj.date
                        };
                    }
                    // costRec.setValue({fieldId: 'custrecord_hc_glcb_reconciliate_done', value: true});
                    // costRec.setText({fieldId: 'custrecord_hc_glcb_reconciliate_date', text: params.custpage_date});
                    let subId = 'recmachcustrecord_hc_glc_bill_order';
                    let count = costRec.getLineCount(subId);
                    for (let i = 0; i < count; i++) {
                        let listId = costRec.getSublistValue({sublistId: subId, fieldId: 'id', line: i});
                        if (typeof actJson[listId] != 'undefined') {


                            costRec.setSublistValue({
                                sublistId: subId,
                                fieldId: 'custrecord_hc_glc_actual_cost',
                                value: actJson[listId].cost,
                                line: i
                            })
                            costRec.setSublistValue({
                                sublistId: subId,
                                fieldId: 'custrecord_hc_glc_vendor_bill',
                                value: actJson[listId].billId,
                                line: i
                            })
                            costRec.setSublistValue({
                                sublistId: subId,
                                fieldId: 'custrecord_hc_glc_bill_je',
                                value: actJson[listId].jeId,
                                line: i
                            });
                            costRec.setSublistText({
                                sublistId: subId,
                                fieldId: 'custrecord_hc_glc_bill_check_date',
                                text: actJson[listId].date,
                                line: i
                            })
                            costRec.setSublistValue({
                                sublistId: subId,
                                fieldId: 'custrecord_hc_glc_bill_reconciliate',
                                value: true,
                                line: i
                            })
                        }
                    }
                    costRec.save({ignoreMandatoryFields: true});
                    response.write("<script type='text/javascript'>window.opener.location.reload();window.close();</script>");
                } catch (e) {
                    log.debug('e', e)
                    log.debug('billIdArr', billIdArr)
                    if (billIdArr.length > 0) {
                        for (let i = 0; i < billIdArr.length; i++) {
                            record.delete({type: billIdArr[i].recordType, id: billIdArr[i].id});
                        }
                    }
                    response.write({output: e.message || e})
                }
            }
        }


        function createJournalRecord(subObj, feeSubsidiary, shippingOrder, spOrderId, feeSubsidiaryStr) {
            let representingvendor = '';
            let subRec = search.lookupFields({
                type: 'subsidiary',
                id: subObj.subsidiary,
                columns: ['representingcustomer', 'representingvendor']
            });
            if (subRec && subRec.representingvendor && subRec.representingvendor.length > 0) {
                representingvendor = subRec.representingvendor[0].value;
            }

            let jeRec = record.create({
                type: 'journalentry',
                isDynamic: true
            });
            jeRec.setValue({fieldId: 'subsidiary', value: feeSubsidiary});
            jeRec.setValue({fieldId: 'currency', value: subObj.currency});
            jeRec.setText({fieldId: 'trandate', text: subObj.date});
            jeRec.setValue({fieldId: 'approvalstatus', value: 1});
            jeRec.setValue({fieldId: 'custbody_hc_applied_shipping_order', value: spOrderId});
            jeRec.setValue({fieldId: 'tosubsidiary', value: subObj.subsidiary});

            jeRec.selectNewLine({sublistId: 'line'});
            // firstAccount
            jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'account', value: subObj.firstAccount});
            jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'debit', value: subObj.estimatedCost});
            jeRec.setCurrentSublistValue({
                sublistId: 'line',
                fieldId: 'memo',
                value: shippingOrder + ' ' + subObj.chengBenStr
            });
            jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'entity', value: subObj.entity});
            jeRec.commitLine({sublistId: 'line'});
            let amt = Subtr(Number(subObj.actCost), Number(subObj.estimatedCost));
            if (Number(amt) != 0) {
                jeRec.selectNewLine({sublistId: 'line'});
                jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'account', value: subObj.secondAccount});
                jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'debit', value: amt});
                jeRec.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'memo',
                    value: shippingOrder + ' ' + subObj.chengBenStr + '预估和实际费用差'
                });
                jeRec.commitLine({sublistId: 'line'});
            }
            jeRec.selectNewLine({sublistId: 'line'});
            jeRec.setCurrentSublistValue({
                sublistId: 'line',
                fieldId: 'account',
                value: ap.get_account_param('CONST_OTHER_INTERNAL_COPING')
            });
            jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'credit', value: subObj.actCost});
            jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'eliminate', value: true});
            jeRec.setCurrentSublistValue({
                sublistId: 'line',
                fieldId: 'memo',
                value: subObj.subsidiaryStr + ' 代付 ' + feeSubsidiaryStr + ' ' + shippingOrder + '头程物流费用'
            });
            jeRec.setCurrentSublistValue({sublistId: 'line', fieldId: 'entity', value: representingvendor});
            jeRec.commitLine({sublistId: 'line'});
            return jeRec.save({ignoreMandatoryFields: true});
        }

        function createBillRecord(subObj, params, shippingOrder, amt1, amt, firstAccount, secondAccount, memoStr, representingcustomer, spOrderId) {
            let billRec = record.create({
                type: 'vendorbill',
                isDynamic: true,
                defaultValues: {entity: subObj.entity}
            });
            billRec.setValue({fieldId: 'subsidiary', value: subObj.subsidiary});
            billRec.setValue({fieldId: 'currency', value: subObj.currency});
            billRec.setValue({fieldId: 'account', value: subObj.account});
            billRec.setText({fieldId: 'trandate', text: subObj.date});
            billRec.setValue({fieldId: 'approvalstatus', value: subObj.approvalstatus});
            billRec.setValue({fieldId: 'custbody_hc_applied_shipping_order', value: spOrderId});

            billRec.selectNewLine({sublistId: 'expense'});
            billRec.setCurrentSublistValue({
                sublistId: 'expense',
                fieldId: 'account',
                value: firstAccount
            });
            billRec.setCurrentSublistValue({
                sublistId: 'expense',
                fieldId: 'amount',
                value: amt1
            });
            billRec.setCurrentSublistValue({
                sublistId: 'expense',
                fieldId: 'memo',
                value: memoStr
            });
            if (memoStr.indexOf('代付') != -1) {
                billRec.setCurrentSublistValue({
                    sublistId: 'expense',
                    fieldId: 'customer',
                    value: representingcustomer
                });
            }
            billRec.commitLine({sublistId: 'expense'});


            if (Number(amt) != 0) {
                billRec.selectNewLine({sublistId: 'expense'});
                billRec.setCurrentSublistValue({
                    sublistId: 'expense',
                    fieldId: 'account',
                    value: secondAccount
                });
                billRec.setCurrentSublistValue({sublistId: 'expense', fieldId: 'amount', value: amt});
                billRec.setCurrentSublistValue({
                    sublistId: 'expense',
                    fieldId: 'memo',
                    value: shippingOrder + ' ' + subObj.chengBenStr + '预付和实际费用差'
                });
                billRec.commitLine({sublistId: 'expense'});
            }
            let billId = billRec.save({ignoreMandatoryFields: true});
            return billId;
        }

        function getPackingOrder(spId) {
            let arr = [];
            let cpSearch = search.create({
                type: 'customrecord_hc_container_packing_list',
                filters: [
                    ['custrecord_hc_cpl_shipping_order', 'anyof', spId],
                    'and',
                    ['isinactive', 'is', 'F']
                ],
                columns: ['custrecord_hc_cpl_packing_order']
            });
            let allDatas = getAllSearchData(cpSearch);
            for (let idx = 0; idx < allDatas.length; idx++) {
                arr.push(allDatas[idx].getValue('custrecord_hc_cpl_packing_order'));
            }
            return arr;
        }

        function getSubmitInformation(params, rec) {
            let sublistName = 'custpage_results';
            let arr = [];
            let lineCount = rec.getLineCount(sublistName);
            for (let i = 0; i < lineCount; i++) {
                let actCost = rec.getSublistValue({group: sublistName, name: 'custpage_list_act_cost', line: i});
                let date = rec.getSublistValue({group: sublistName, name: 'custpage_list_date', line: i});
                if (actCost && date) {
                    arr.push({
                        subsidiary: rec.getSublistValue({
                            group: sublistName,
                            name: 'custpage_list_subsidiary',
                            line: i
                        }),
                        entity: rec.getSublistValue({group: sublistName, name: 'custpage_list_forwarder', line: i}),
                        currency: rec.getSublistValue({group: sublistName, name: 'custpage_list_currency', line: i}),
                        account: ap.get_account_param('CONST_ACCOUNTING_CHECK_ACCOUNT'),
                        date: date,
                        approvalstatus: 1,
                        estimatedCost: rec.getSublistValue({
                            group: sublistName,
                            name: 'custpage_list_estimated_cost',
                            line: i
                        }),
                        actCost: actCost,
                        chenBen: rec.getSublistValue({group: sublistName, name: 'custpage_list_chengben', line: i}),
                        firstAccount: rec.getSublistValue({
                            group: sublistName,
                            name: 'custpage_list_first_account',
                            line: i
                        }),
                        secondAccount: rec.getSublistValue({
                            group: sublistName,
                            name: 'custpage_list_second_account',
                            line: i
                        }),
                        costId: rec.getSublistValue({group: sublistName, name: 'custpage_list_id', line: i}),
                        chengBenStr: rec.getSublistValue({
                            group: sublistName,
                            name: 'custpage_list_chengben_str',
                            line: i
                        }),
                        venSub: rec.getSublistValue({group: sublistName, name: 'custpage_list_vend_sub', line: i}),
                        subsidiaryStr: rec.getSublistValue({
                            group: sublistName,
                            name: 'custpage_list_subsidiary_str',
                            line: i
                        })
                    })
                }
            }
            return arr;
        }

        function getVendorSubsidiary() {
            let vendSubsidiaryArr = {};
            let vendorSearch = search.create({
                type: 'vendor',
                filters: ['isinactive', 'is', 'F'],
                columns: [
                    search.createColumn({
                        name: 'internalid',
                        join: 'mseSubsidiary'
                    })]
            });
            let rs = getAllSearchData(vendorSearch);
            let columns = vendorSearch.columns;
            rs.forEach(function (vend) {
                if (typeof vendSubsidiaryArr[vend.id] == 'undefined') {
                    vendSubsidiaryArr[vend.id] = [];
                }
                vendSubsidiaryArr[vend.id].push(vend.getValue(columns[0]));
            })
            return vendSubsidiaryArr;
        }

        function getCost(parentId) {
            let dSearch = search.create({
                type: 'customrecord_hc_global_logistics_cost',
                filters: [
                    ['isinactive', 'is', 'F'],
                    'and',
                    ['custrecord_hc_glc_bill_order', 'anyof', parentId],
                    'and',
                    ['custrecord_hc_glc_bill_reconciliate','is','F']
                ],
                columns: [
                    search.createColumn({
                        name: 'custrecord_hc_glc_estimated_cost',    //预估费用
                        label: '{custpage_list_estimated_cost}'
                    }),
                    search.createColumn({
                        name: 'custrecord_hc_glc_forwarder',   //收款方
                        label: '{custpage_list_forwarder}'
                    }),
                    search.createColumn({
                        name: 'custrecord_hc_glc_currency',//币种
                        label: '{custpage_list_currency}'
                    }),
                    search.createColumn({
                        name: 'custrecord_hc_glc_bill_subsidiary',//附属公司
                        label: '{custpage_list_subsidiary}'
                    }),
                    search.createColumn({
                        name: 'custrecord_hc_glc_bill_subsidiary',//附属公司
                        label: '[custpage_list_subsidiary_str]'
                    }),
                    search.createColumn({
                        name: 'custrecord_hc_glc_cost_type',
                        label: '[custpage_list_chengben_str]'
                    }),
                    search.createColumn({
                        name: 'internalid',//内部标识
                        label: '{custpage_list_id}'
                    }),
                    search.createColumn({
                        name: 'custrecord_hc_glc_cost_type',//内部标识
                        label: '{custpage_list_chengben}'
                    }),
                    search.createColumn({
                        name: 'custrecord_hc_lcc_asset_account',//入库资产科目
                        join: 'custrecord_hc_glc_cost_type',
                        label: '{custpage_list_first_account}'
                    }),
                    search.createColumn({
                        name: 'custrecord_hc_lcc_cogs_account',//出库还原科目
                        join: 'custrecord_hc_glc_cost_type',
                        label: '{custpage_list_second_account}'
                    }),
                    search.createColumn({
                        name: 'subsidiary',//供应商子公司
                        join: 'custrecord_hc_glc_forwarder',
                        label: '{custpage_list_vend_sub}'
                    }),
                ]
            });
            let allDatas = getAllSearchData(dSearch);
            let dColumns = dSearch.columns;
            return getData(allDatas, dColumns)
        }

        function getData(res, columns) {
            var datas = [];
            if (res && res.length > 0) {
                for (var i = 0; i < res.length; i++) {
                    var data = {};
                    for (var j = 0; j < columns.length; j++) {
                        var label = columns[j].label;
                        if (/\{.+\}/.test(label)) {
                            var name = label.replace(/[\{\}]/g, '');
                            data[name] = res[i].getValue(columns[j]);
                        } else if (/\[.+\]/.test(label)) {
                            var name = label.replace(/[\[\]]/g, '');
                            data[name] = res[i].getText(columns[j]);
                        }
                    }
                    datas.push(data);
                }
            }
            return datas;
        }

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

        function Subtr(arg1, arg2) {
            var r1, r2, m, n;
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
            m = Math.pow(10, Math.max(r1, r2));
            //last modify by deeka
            //动态控制精度长度
            n = (r1 >= r2) ? r1 : r2;
            return ((arg1 * m - arg2 * m) / m).toFixed(n);
        }


        return {onRequest}

    })
;
