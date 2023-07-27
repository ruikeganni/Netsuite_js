/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * version        date                 user                    memo
 * 1.0            2022.03.02        Joise                   新建：根据订单路由记录查找需要生成的发货通知单生成日记账
 * 2.0            2022.05.05        Joise                   增加收入确认的回写
 */
define(['N/record', 'N/runtime', 'N/search', 'N/config', '../../account_params/account_params'],
    /**
     * @param{record} record
     * @param{runtime} runtime
     * @param{search} search
     */
    (record, runtime, search, config, ap) => {
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

        function getItemClassInfo(itemArr) {
            let itemInfo = {};
            if (itemArr.length > 0) {
                let itemSearch = search.create({
                    type: 'item',
                    filters: ['internalid', 'anyof', itemArr],
                    columns: ['class']
                });
                let itemRs = getAllSearchData(itemSearch);
                for (let i = 0; i < itemRs.length; i++) {
                    itemInfo[itemRs[i].id] = itemRs[i].getValue('class');
                }
            }
            return itemInfo;
        }

        function getExecutedJson(recognition, revenue, searchParam) {
            let foIdArr = [];
            let json = {};
            let foSearch = search.load(searchParam);
            let foRs = getAllSearchData(foSearch);
            if (foRs && foRs.length > 0) {
                for(let i=0;i<foRs.length;i++){
                    foIdArr.push(foRs[i].id)
                }
            }
            log.debug('foIdArr',foIdArr)
            if (foIdArr.length > 0) {
                log.debug('revenue=' + revenue, 'recognition=' + recognition)
                let dFilters = [
                    ['isinactive', 'is', 'F'],
                    'and',
                    ['custrecord_hc_mofo_status', 'anyof', '5'],
                    'and',
                    ['custrecord_hc_mofo_posting_record', 'noneof', '@NONE@'],
                    'and',
                    ['custrecord_hc_mofo_revenue_recognized', 'is', 'F'],
                    // 'and',
                    // ['custrecord_hc_mofo_revenue_transaction','anyof','54380'],
                    'and',
                    ['internalid', 'anyof', foIdArr]
                ];
                if (Number(recognition) == 1) {
                    //当配置的节点为包裹出库时，则搜索①已成功出库，②出库日期有值，③有出库单据，④未收入确认的发货通知单明细信息生成应收确认日记账；
                    dFilters.push('and', ['custrecord_hc_mofo_shipped_date', 'isnotempty', ''])
                }
                if (Number(recognition) == 2) {
                    //当配置的节点为包裹签收时，则搜索①已成功出库，②签收日期有值，③有出库单据，④未收入确认的发货通知单明细信息生成应收确认日记账；
                    dFilters.push('and', ['custrecord_hc_mofo_delivered_date', 'isnotempty', ''])
                }
                let dColumns = [
                    search.createColumn({
                        name: 'custrecord_hc_mo_subsidiary',
                        join: 'custrecord_hc_mofo_created_from'
                    }),  //附属公司
                    search.createColumn({
                        name: 'custrecord_hc_mo_currency',
                        join: 'custrecord_hc_mofo_created_from'
                    }),//货币
                    search.createColumn({
                        name: 'custrecord_hc_mo_customer',
                        join: 'custrecord_hc_mofo_created_from'
                    }),//店铺
                    search.createColumn({
                        name: 'custrecord_hc_mo_department',
                        join: 'custrecord_hc_mofo_created_from'
                    }),//部门
                    search.createColumn({
                        name: 'custrecord_hc_mo_ecommerce_platform',
                        join: 'custrecord_hc_mofo_created_from'
                    }),//销售平台
                    'custrecord_hc_mofo_shipped_date',//出库日期
                    'custrecord_hc_mofo_delivered_date',//签收日期
                    search.createColumn({
                        name: 'custrecord_hc_mofi_fulfillment_item',
                        join: 'custrecord_hc_mofi_fulfillment_order',// 包裹货品
                    }),
                    search.createColumn({
                        name: 'custrecord_hc_mofi_sku',
                        join: 'custrecord_hc_mofi_fulfillment_order',// 平台sku
                    }),
                    'custrecord_hc_mofo_order_id',//平台订单号
                    'custrecord_hc_mofo_created_from',//创建自
                    search.createColumn({
                        name: 'custrecord_hc_mofi_quantity',
                        join: 'custrecord_hc_mofi_fulfillment_order',// 数量
                    }),
                    'custrecord_hc_mofo_state',//州
                    'custrecord_hc_mofo_district',//区、县
                    'custrecord_hc_mofo_city',//城市
                    search.createColumn({
                        name: 'custrecord_hc_mofi_order_line',
                        join: 'custrecord_hc_mofi_fulfillment_order',// 订单行
                    }),
                ];
                let dSearch = search.create({
                    type: 'customrecord_hc_mo_fulfillment_order',
                    filters: dFilters,
                    columns: dColumns
                });
                let allDatas = getAllSearchData(dSearch);
                let itemIdArr = [];
                for (let idx = 0; idx < allDatas.length; idx++) {
                    itemIdArr.push(allDatas[idx].getValue(dColumns[7]));
                }
                //获取货品的类别
                let itemClass = getItemClassInfo(itemIdArr);
                let sysRec = config.load({type: config.Type.ACCOUNTING_PREFERENCES});
                let debitAccount = sysRec.getValue('ARACCOUNT');
                let creditAccount = sysRec.getValue('INCOMEACCOUNT');
                for (let i = 0; i < allDatas.length; i++) {
                    let primiarySub = allDatas[i].getValue(dColumns[0]);
                    let currency = allDatas[i].getValue(dColumns[1]);
                    let profile = allDatas[i].getValue(dColumns[2]);
                    let dateStr = Number(recognition) == 1 ? allDatas[i].getValue(dColumns[5]) : allDatas[i].getValue(dColumns[6]);
                    let itemId = allDatas[i].getValue(dColumns[7]);
                    let jsonKey = allDatas[i].id;
                    if (revenue) {
                        jsonKey = primiarySub + '-' + currency + '-' + profile + '-' + dateStr;
                    }
                    for (let jeLine = 0; ; jeLine++) {
                        if (typeof json[jsonKey] == 'undefined' || typeof json[jsonKey].jeDetails == 'undefined' || json[jsonKey].jeDetails.length <= 150) {
                            break;
                        } else {
                            jsonKey += jeLine;
                        }
                    }

                    let lineJson = {
                        entity: profile,//name
                        department: allDatas[i].getValue(dColumns[3]),//部门
                        class: itemClass[itemId] || '',//类别
                        custcol_hc_seller_sku: allDatas[i].getValue(dColumns[8]),//平台SKU
                        custcol_hc_fulfill_item: itemId,//出库货品
                        custcol_hc_platform_original_order_id: allDatas[i].getValue(dColumns[9]),//平台订单号
                        custcol_hc_from_merchant_order: allDatas[i].getValue(dColumns[10]),//创建自
                        cseg_hc_salechannel: allDatas[i].getValue(dColumns[4]),     //平台、渠道
                        qty: allDatas[i].getValue(dColumns[11]),//数量
                        state: allDatas[i].getValue(dColumns[12]),//州
                        district: allDatas[i].getValue(dColumns[13]),//区、县
                        city: allDatas[i].getValue(dColumns[14]),//城市
                        orderLineId: allDatas[i].getValue(dColumns[15]),//订单行
                    }
                    if (json[jsonKey] == undefined || json[jsonKey] == 'undefined') {
                        json[jsonKey] = {
                            subsidiary: primiarySub,
                            currency: currency,
                            trandate: dateStr,
                            approvalstatus: 2,
                            custbody_hc_je_financial_type: 4,
                            debitAccount: debitAccount,
                            creditAccount: creditAccount,
                            jeDetails: [],
                            foIdArr: [],
                            orderId: []
                        }
                    }
                    json[jsonKey].jeDetails.push(lineJson);
                    json[jsonKey].foIdArr.push(allDatas[i].id);
                    json[jsonKey].orderId.push(lineJson.custcol_hc_platform_original_order_id);
                }
            }
            return json;
        }

        const getInputData = (inputContext) => {
            try {
                let executedJson = {};
                //根据《订单路由》配置的条件进行生成，条件1：收入确认的节点；条件2：是否汇总生成。
                let routerSeach = search.create({
                    type: 'customrecord_hc_merchant_order_router',
                    filters: ['isinactive', 'is', 'F'],
                    columns: ['custrecord_hc_mor_revenue_recognition', 'custrecord_hc_mor_summary_revenue']
                });
                let roterRs = routerSeach.run().getRange({start: 0, end: 1});
                let searchParam = runtime.getCurrentScript().getParameter('custscript_executed_search');
                if (roterRs.length > 0 && searchParam) {
                    let recognition = roterRs[0].getValue('custrecord_hc_mor_revenue_recognition');//收入确认的节点
                    let revenue = roterRs[0].getValue('custrecord_hc_mor_summary_revenue');
                    executedJson = getExecutedJson(recognition, revenue, searchParam);
                }
                // for(let key in executedJson){
                //     log.debug(key,executedJson[key])
                // }
                // log.debug('executedJson',executedJson)
                return executedJson;
            } catch (e) {
                log.debug('input-e', e)
            }
        }

        function getCostInfo(orderIdArr) {
            let costFilter = [['isinactive', 'is', 'F']];
            let subFilter = [];
            for (let i = 0; i < orderIdArr.length; i++) {
                if (i != 0) {
                    subFilter.push('or')
                }
                subFilter.push(['custrecord_hc_skucm_order_id', 'is', orderIdArr[i]]);
            }
            costFilter.push('and', subFilter);
            //  log.debug('costFilter',costFilter)
            let costSearch = search.create({
                type: 'customrecord_hc_sku_revenue_cost_cm',
                filters: costFilter,
                columns: [
                    'custrecord_hc_skucm_order_id',
                    'custrecord_hc_skucm_seller_sku',
                    'custrecord_hc_skucm_inventory_item',
                    'custrecord_hc_skucm_order_line',
                    'custrecord_hc_skucm_unit_rate',
                    'custrecord_hc_skucm_unit_taxamount',
                    search.createColumn({
                        name: 'formulanumeric',
                        formula: 'NVL({custrecord_hc_skucm_quantity},0)-NVL({custrecord_hc_skucm_quantity_recognized},0)',
                    }),
                    search.createColumn({
                        name: 'formulanumeric',
                        formula: 'NVL({custrecord_hc_skucm_fxamount},0)-NVL({custrecord_hc_skucm_revenue_recognized},0)',
                    }),
                    'custrecord_hc_skucm_quantity_recognized',
                    search.createColumn({
                        name: 'formulanumeric',
                        formula: 'NVL({custrecord_hc_skucm_taxamount},0)-NVL({custrecord_hc_skucm_tax_recognized},0)',
                    }),
                    search.createColumn({
                        name: 'formulanumeric',
                        formula: 'NVL({custrecord_hc_skucm_tax_recognized},0)',
                    }),
                    search.createColumn({
                        name: 'formulanumeric',
                        formula: 'NVL({custrecord_hc_skucm_revenue_recognized},0)',
                    }),
                    search.createColumn({
                        name: 'formulanumeric',
                        formula: 'NVL({custrecord_hc_skucm_quantity},0)',
                    }),
                    search.createColumn({
                        name: 'formulanumeric',
                        formula: 'NVL({custrecord_hc_skucm_fxamount},0)',
                    }),
                    search.createColumn({
                        name: 'formulanumeric',
                        formula: 'NVL({custrecord_hc_skucm_taxamount},0)',
                    }),
                ]
            });
            let dColumns = costSearch.columns;
            let costInfo = {};
            let allDatas = getAllSearchData(costSearch);
            for (let idx = 0; idx < allDatas.length; idx++) {
                let orderId = allDatas[idx].getValue(dColumns[0]);
                let sellerSku = allDatas[idx].getValue(dColumns[1]);
                let itemId = allDatas[idx].getValue(dColumns[2]);
                let orderLine = allDatas[idx].getValue(dColumns[3]);
                let key = orderId + '-' + sellerSku + '-' + itemId + '-' + orderLine;
                costInfo[key] = {
                    rate: allDatas[idx].getValue(dColumns[4]),
                    taxAmt: allDatas[idx].getValue(dColumns[5]),
                    qty: allDatas[idx].getValue(dColumns[6]),
                    recId: allDatas[idx].id,
                    amtTotal: allDatas[idx].getValue(dColumns[7]),
                    quantityRecognized: allDatas[idx].getValue(dColumns[8]),
                    taxAmtTotal: allDatas[idx].getValue(dColumns[9]),
                    taxRecognized: allDatas[idx].getValue(dColumns[10]),
                    revenueRecognized: allDatas[idx].getValue(dColumns[11]),
                    qtyTotal: allDatas[idx].getValue(dColumns[12]),
                    amountTotal: allDatas[idx].getValue(dColumns[13]),
                    taxAmountTotal: allDatas[idx].getValue(dColumns[14]),
                }
            }
            return costInfo;
        }

        function getTaxInfo(subId) {
            let taxInfo = {
                state: {},
                city: {}
            };
            let taxSearch = search.create({
                type: 'salestaxitem',
                filters: [
                    ['isinactive', 'is', 'F'],
                    'and',
                    ['subsidiary', 'anyof', subId]
                ],
                columns: [
                    'statedisplayname',
                    'city',
                    'saleaccount'
                ]
            });
            let allDatas = getAllSearchData(taxSearch);
            for (let i = 0; i < allDatas.length; i++) {
                let state = allDatas[i].getValue('statedisplayname');
                let city = allDatas[i].getValue('city');
                let account = allDatas[i].getValue('saleaccount');
                if (taxInfo.state[state] == undefined || taxInfo.state[state] == 'undefined') {
                    taxInfo.state[state] = [];
                }
                taxInfo.state[state].push(account);

                if (taxInfo.city[city] == undefined || taxInfo.city[city] == 'undefined') {
                    taxInfo.city[city] = [];
                }
                taxInfo.city[city].push(account);
            }
            //log.debug('taxInfo',taxInfo.state)
            return taxInfo;
        }

        function getTaxAccountId(customId) {
            let dSearch = search.create({
                type: 'customrecord_hc_seller_profile',
                filters: [
                    ['isinactive', 'is', 'F'],
                    'and',
                    ['custrecord_hc_sp_customer', 'anyof', customId],
                    'and',
                    ['custrecord_hc_sp_tax_account', 'noneof', '@NONE@']
                ],
                columns: ['custrecord_hc_sp_tax_account']
            })
            let rs = dSearch.run().getRange({start: 0, end: 1});
            if (rs.length > 0) {
                return rs[0].getValue('custrecord_hc_sp_tax_account')
            }
            return '';
        }

        const map = (mapContext) => {
            let jeId = '';
            // log.debug('key', mapContext.key)
            let mapObj = JSON.parse(mapContext.value);
            log.debug('mapObj', mapObj);
            let foIdArr = mapObj.foIdArr;
            try {
                let jeDetails = mapObj.jeDetails;
                //根据子公司查找税码
                //let taxInfo = getTaxInfo(mapObj.subsidiary);
                //log.debug('taxInfo', taxInfo);
                //根据平台订单号查找商品经营利润分析列表，以平台订单号+库存货品+平台货品+订单行作为行唯一键
                let costInfo = getCostInfo(mapObj.orderId);
                log.debug('costInfo', costInfo);
                //每个map生成一个日记账
                let jeRec = record.create({type: 'journalentry'});
                jeRec.setValue({fieldId: 'subsidiary', value: mapObj.subsidiary});
                jeRec.setValue({fieldId: 'currency', value: mapObj.currency});
                jeRec.setText({fieldId: 'trandate', text: mapObj.trandate});
                jeRec.setValue({fieldId: 'approvalstatus', value: mapObj.approvalstatus});
                jeRec.setValue({fieldId: 'custbody_hc_je_financial_type', value: mapObj.custbody_hc_je_financial_type});

                let lineCount = 0;
                let usedCost = {};
                let tempQty = {};
                let tempAmt = {};
                let tempTax = {};
                let accountId = getTaxAccountId(jeDetails[0].entity);

                if (accountId == '') {
                    accountId = Number(mapObj.subsidiary) == ap.get_account_param('CONST_BPO_INC_SUBSIDIARY') || Number(mapObj.subsidiary) == ap.get_account_param('CONST_BWK_SUBSIDIARY') ? ap.get_account_param('CONST_FO_CREDIT_ACCOUNT_BPI') : ap.get_account_param('CONST_FO_CREDIT_ACCOUNT');
                }

                for (let idx = 0; idx < jeDetails.length; idx++) {
                    let subObj = jeDetails[idx];
                    let key = subObj.custcol_hc_platform_original_order_id + '-' + subObj.custcol_hc_seller_sku + '-' + subObj.custcol_hc_fulfill_item + '-' + subObj.orderLineId;
                    if (costInfo[key] == undefined || costInfo[key] == 'undefined' || costInfo[key].rate == '') {
                        // log.debug('key',key)
                        throw '商品经营利润分析列表没有维护该订单该货品信息或者订单货品的单价不存在';
                    } else {
                        let debitAmt = 0;
                        let itemCost = costInfo[key];
                        log.debug('itemCost', itemCost);
                        let creditAmt = 0;
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'account',
                            value: mapObj.creditAccount,
                            line: lineCount
                        });
                        if (tempQty[key] == undefined || tempQty[key] == 'undefined') {
                            tempQty[key] = subObj.qty;
                        } else {
                            tempQty[key] = accAdd(Number(subObj.qty), Number(tempQty[key]));
                        }

                        //  log.debug('tempAmt[key]',tempAmt[key])
                        if (Number(tempQty[key]) == Number(itemCost.qty)) {
                            log.debug('111', tempAmt[key] != undefined);
                            //如果本次生成je的数量刚好是剩余应该生成je的数量，贷方金额取剩下所有的金额
                            if (tempAmt[key] != undefined) {
                                let tempCreditAmt = Subtr(Number(itemCost.amountTotal), accAdd(Number(itemCost.revenueRecognized), Number(tempAmt[key])));
                                creditAmt = Number(mapObj.subsidiary) == ap.get_account_param('CONST_JAPAN_SUBSIDIARY') ? keepTwoDecimalFull(tempCreditAmt) : keepTwoDecimalFull(tempCreditAmt);
                            } else {
                                creditAmt = Number(mapObj.subsidiary) == ap.get_account_param('CONST_JAPAN_SUBSIDIARY') ? keepTwoDecimalFull(itemCost.amtTotal) : keepTwoDecimalFull(itemCost.amtTotal);
                            }
                            log.debug('creditAmt', creditAmt)
                        } else {
                            //如果本次生成je的数量是分批次生成je的其中一次，贷方金额取单价*数量
                            creditAmt = Number(mapObj.subsidiary) == ap.get_account_param('CONST_JAPAN_SUBSIDIARY') ? keepTwoDecimalFull(accMul(Number(subObj.qty), Number(itemCost.rate))) : keepTwoDecimalFull(accMul(Number(subObj.qty), Number(itemCost.rate)));
                            //   log.debug('creditAmt',creditAmt)
                            if (tempAmt[key] == undefined || tempAmt[key] == 'undefined') {
                                tempAmt[key] = creditAmt;
                            } else {
                                tempAmt[key] = keepTwoDecimalFull(accAdd(Number(tempAmt[key]), Number(creditAmt)));
                            }
                        }
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'credit',
                            value: creditAmt,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'entity',
                            value: subObj.entity,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'department',
                            value: subObj.department,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'class',
                            value: subObj.class,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_seller_sku',
                            value: subObj.custcol_hc_seller_sku,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_fulfill_item',
                            value: subObj.custcol_hc_fulfill_item,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_platform_original_order_id',
                            value: subObj.custcol_hc_platform_original_order_id,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_from_merchant_order',
                            value: subObj.custcol_hc_from_merchant_order,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'cseg_hc_salechannel',
                            value: subObj.cseg_hc_salechannel,
                            line: lineCount
                        });
                        debitAmt = keepTwoDecimalFull(accAdd(Number(debitAmt), Number(creditAmt)));
                        lineCount++;
                        let creditAmt2 = 0;
                        if (itemCost.taxAmt) {
                            // let cityStr = subObj.city.toUpperCase();
                            // log.debug('taxInfo.state[subObj.state]', taxInfo.state[subObj.state]);
                            // log.debug('taxInfo.city[subObj.city]', taxInfo.city[cityStr]);
                            // //获取科目
                            // if (taxInfo.state[subObj.state] != undefined && taxInfo.state[subObj.state] != 'undefined' && taxInfo.state[subObj.state].length == 1) {
                            //     accountId = taxInfo.state[subObj.state][0];
                            // } else if (taxInfo.city[cityStr] != undefined && taxInfo.city[cityStr] != 'undefined') {
                            //     accountId = taxInfo.city[cityStr][0];5225
                            // }
                            // if (accountId == '') {
                            //     throw '税金科目不存在'
                            // }
                            if (Number(tempQty[key]) == Number(itemCost.qty)) {
                                //如果本次生成je的数量刚好是剩余应该生成je的数量，贷方金额取剩下所有的金额
                                if (tempTax[key] != undefined && tempTax[key] != 'undefined') {
                                    let tempCreditAmt2 = Subtr(Number(itemCost.taxAmountTotal), accAdd(Number(itemCost.taxRecognized), Number(tempTax[key])));
                                    creditAmt2 = Number(mapObj.subsidiary) == ap.get_account_param('CONST_JAPAN_SUBSIDIARY') ? keepTwoDecimalFull(tempCreditAmt2) : keepTwoDecimalFull(tempCreditAmt2);
                                } else {
                                    creditAmt2 = Number(mapObj.subsidiary) == ap.get_account_param('CONST_JAPAN_SUBSIDIARY') ? keepTwoDecimalFull(itemCost.taxAmtTotal) : keepTwoDecimalFull(itemCost.taxAmtTotal);
                                }
                            } else {
                                //如果本次生成je的数量是分批次生成je的其中一次，贷方金额取单价*数量
                                creditAmt2 = Number(mapObj.subsidiary) == ap.get_account_param('CONST_JAPAN_SUBSIDIARY') ? keepTwoDecimalFull(accMul(Number(subObj.qty), Number(itemCost.taxAmt))) : keepTwoDecimalFull(accMul(Number(subObj.qty), Number(itemCost.taxAmt)));
                                if (tempTax[key] == undefined || tempTax[key] == 'undefined') {
                                    tempTax[key] = creditAmt2;
                                } else {
                                    tempTax[key] = keepTwoDecimalFull(accAdd(Number(tempTax[key]), Number(creditAmt2)));
                                }
                            }
                            if (Number(creditAmt2) != 0) {
                                jeRec.setSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'account',
                                    value: accountId,
                                    line: lineCount
                                });
                                jeRec.setSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'credit',
                                    value: creditAmt2,
                                    line: lineCount
                                });
                                jeRec.setSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'entity',
                                    value: subObj.entity,
                                    line: lineCount
                                });
                                jeRec.setSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'department',
                                    value: subObj.department,
                                    line: lineCount
                                });
                                jeRec.setSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'class',
                                    value: subObj.class,
                                    line: lineCount
                                });
                                jeRec.setSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'custcol_hc_seller_sku',
                                    value: subObj.custcol_hc_seller_sku,
                                    line: lineCount
                                });
                                jeRec.setSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'custcol_hc_fulfill_item',
                                    value: subObj.custcol_hc_fulfill_item,
                                    line: lineCount
                                });
                                jeRec.setSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'custcol_hc_platform_original_order_id',
                                    value: subObj.custcol_hc_platform_original_order_id,
                                    line: lineCount
                                });
                                jeRec.setSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'custcol_hc_from_merchant_order',
                                    value: subObj.custcol_hc_from_merchant_order,
                                    line: lineCount
                                });
                                jeRec.setSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'cseg_hc_salechannel',
                                    value: subObj.cseg_hc_salechannel,
                                    line: lineCount
                                });
                                debitAmt = keepTwoDecimalFull(accAdd(Number(debitAmt), Number(creditAmt2)));
                                lineCount++;
                            }
                        }
                        if (usedCost[itemCost.recId] == undefined || usedCost[itemCost.recId] == 'undefined') {
                            usedCost[itemCost.recId] = [];
                        }
                        usedCost[itemCost.recId].push({
                            custrecord_hc_skucm_quantity_recognized: subObj.qty,
                            custrecord_hc_skucm_revenue_recognized: creditAmt,
                            custrecord_hc_skucm_tax_recognized: creditAmt2
                        })

                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'account',
                            value: mapObj.debitAccount,
                            line: lineCount
                        });
                        jeRec.setSublistValue({sublistId: 'line', fieldId: 'debit', value: debitAmt, line: lineCount});
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'entity',
                            value: subObj.entity,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'department',
                            value: subObj.department,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'class',
                            value: subObj.class,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_seller_sku',
                            value: subObj.custcol_hc_seller_sku,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_fulfill_item',
                            value: subObj.custcol_hc_fulfill_item,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_platform_original_order_id',
                            value: subObj.custcol_hc_platform_original_order_id,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_hc_from_merchant_order',
                            value: subObj.custcol_hc_from_merchant_order,
                            line: lineCount
                        });
                        jeRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'cseg_hc_salechannel',
                            value: subObj.cseg_hc_salechannel,
                            line: lineCount
                        });
                        lineCount++;
                    }
                }
                let line_count = jeRec.getLineCount('line');
                let lineArr = [];
                for (let tempCount = 0; tempCount < line_count; tempCount++) {
                    lineArr.push({
                        // account:jeRec.getSublistValue({sublistId:'line',fieldId:'account',line:tempCount}),
                        c: jeRec.getSublistValue({sublistId: 'line', fieldId: 'credit', line: tempCount}),
                        d: jeRec.getSublistValue({sublistId: 'line', fieldId: 'debit', line: tempCount}),
                    })
                }
                log.debug('lineArr', lineArr)
                jeId = jeRec.save({ignoreMandatoryFields: true});
                for (let key in usedCost) {
                    mapContext.write({
                        key: JSON.stringify({
                            recordType: 'customrecord_hc_sku_revenue_cost_cm',
                            recordId: key
                        }),
                        value: JSON.stringify(usedCost[key])
                    })
                }
                for (let fo = 0; fo < foIdArr.length; fo++) {
                    mapContext.write({
                        key: JSON.stringify({
                            recordType: 'customrecord_hc_mo_fulfillment_order',
                            recordId: foIdArr[fo]
                        }),
                        value: JSON.stringify({flag: true, jeInternalId: jeId})
                    })
                }
            } catch (e) {
                log.debug('map-e', e);
                //如果日记账生成失败，删除日记账
                if (jeId != '') {
                    record.delete({type: 'journalentry', jeId})
                }
                for (let fo = 0; fo < foIdArr.length; fo++) {
                    mapContext.write({
                        key: JSON.stringify({
                            recordType: 'customrecord_hc_mo_fulfillment_order',
                            recordId: foIdArr[fo]
                        }),
                        value: JSON.stringify({flag: false, value: e.message || e})
                    })
                }
            }
        }

        const reduce = (reduceContext) => {
            try {
                let reduceValues = reduceContext.values;
                let reduceKey = JSON.parse(reduceContext.key);
                // log.debug('reduceKey', reduceKey);
                // log.debug('reduceValues', reduceValues);
                if (reduceKey.recordType == 'customrecord_hc_sku_revenue_cost_cm') {   //更新的是订单发货通知单
                    let rec = record.load({type: reduceKey.recordType, id: reduceKey.recordId});
                    let orderLine = rec.getValue('custrecord_hc_skucm_order_line');
                    let orderId = rec.getValue('custrecord_hc_skucm_order_id');
                    let obj = {
                        custrecord_hc_skucm_quantity_recognized: 0,
                        custrecord_hc_skucm_revenue_recognized: 0,
                        custrecord_hc_skucm_tax_recognized: 0
                    };
                    let recObj = {
                        custrecord_hc_skucm_quantity_recognized: rec.getValue('custrecord_hc_skucm_quantity_recognized'),
                        custrecord_hc_skucm_revenue_recognized: rec.getValue('custrecord_hc_skucm_revenue_recognized'),
                        custrecord_hc_skucm_tax_recognized: rec.getValue('custrecord_hc_skucm_tax_recognized'),
                    }
                    for (let i = 0; i < reduceValues.length; i++) {
                        let arr = JSON.parse(reduceValues[i]);
                        for (let index = 0; index < arr.length; index++) {
                            let subObj = arr[index];
                            // log.debug('subObj',subObj)
                            for (let key in obj) {
                                obj[key] = accAdd(Number(obj[key]), Number(subObj[key]));
                            }
                        }
                    }
                    //log.debug('obj',obj)
                    for (let subKey in obj) {
                        rec.setValue({fieldId: subKey, value: accAdd(Number(obj[subKey]), Number(recObj[subKey]))});
                    }
                    rec.save({ignoreMandatoryFields: true});
                    //查找平台商品/SKU 的商品经营利润分析
                    let cmId = searchCostCm(orderId, orderLine, reduceKey.recordId);
                    if (cmId != '') {
                        let cmRec = record.load({type: 'customrecord_hc_sku_revenue_cost_cm', id: cmId});
                        let quantity_recognized = cmRec.getValue('custrecord_hc_skucm_quantity_recognized');
                        let revenue_recognized = cmRec.getValue('custrecord_hc_skucm_revenue_recognized');
                        let tax_recognized = cmRec.getValue('custrecord_hc_skucm_tax_recognized');
                        let quantity = cmRec.getValue('custrecord_hc_skucm_quantity');
                        let qtyTotal = accAdd(Number(quantity_recognized), Number(obj.custrecord_hc_skucm_quantity_recognized))
                        if (Number(quantity) < Number(qtyTotal)) {
                            cmRec.setValue({fieldId: 'custrecord_hc_skucm_quantity_recognized', value: quantity});
                        } else {
                            cmRec.setValue({fieldId: 'custrecord_hc_skucm_quantity_recognized', value: qtyTotal});
                        }
                        cmRec.setValue({
                            fieldId: 'custrecord_hc_skucm_revenue_recognized',
                            value: accAdd(Number(revenue_recognized), Number(obj.custrecord_hc_skucm_revenue_recognized))
                        })
                        cmRec.setValue({
                            fieldId: 'custrecord_hc_skucm_tax_recognized',
                            value: accAdd(Number(tax_recognized), Number(obj.custrecord_hc_skucm_tax_recognized))
                        })
                        cmRec.save({ignoreMandatoryFields: true});
                    }
                }

                if (reduceKey.recordType == 'customrecord_hc_mo_fulfillment_order') {   //更新的是订单发货通知单
                    let rec = record.load({type: reduceKey.recordType, id: reduceKey.recordId});
                    if (reduceValues.length > 0) {
                        let obj = JSON.parse(reduceValues[0]);
                        if (obj.flag) {
                            rec.setValue({fieldId: 'custrecord_hc_mofo_revenue_recognized', value: true});
                            rec.setValue({fieldId: 'custrecord_hc_mofo_revenue_transaction', value: obj.jeInternalId});
                        } else {
                            let logStr = rec.getValue('custrecord_hc_mofo_processing_log');
                            let dateStr = dateChange();
                            rec.setValue({
                                fieldId: 'custrecord_hc_mofo_processing_log',
                                value: logStr + '\n' + dateStr + obj.value
                            });
                        }
                        rec.save({ignoreMandatoryFields: true});
                    }
                }

            } catch (e) {
                log.debug('recduce-e', e)
            }
        }

        function searchCostCm(orderId, orderLine, internailId) {
            let dSearch = search.create({
                type: 'customrecord_hc_sku_revenue_cost_cm',
                filters: [
                    ['custrecord_hc_skucm_level', 'anyof', 1],
                    'and',
                    ['custrecord_hc_skucm_order_line', 'is', orderLine],
                    'and',
                    ['custrecord_hc_skucm_order_id', 'is', orderId],
                    'and',
                    ['internalid', 'noneof', internailId]
                ]
            });
            let rs = dSearch.run().getRange({start: 0, end: 1});
            if (rs.length > 0) {
                return rs[0].id;
            }
            return '';
        }

        function dateChange(num, date) {
            if (!date) {
                //没有传入值时,默认是当前日期
                var now = new Date();
                var moffset = now.getTimezoneOffset();
                var now = new Date(now.getTime() + ((8 * 60 + moffset) * 60 * 1000));
                date = new Date(now.getTime() + (0 * 60 * 60 * 1000));
                date = date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate();
            }
            if (!num) {
                num = 0;
            }
            date += " 00:00:00";//设置为当天凌晨12点
            date = Date.parse(new Date(date)) / 1000;//转换为时间戳
            date += (86400) * num;//修改后的时间戳
            var newDate = new Date(parseInt(date) * 1000);//转换为时间
            var month = newDate.getMonth() + 1;
            var day = newDate.getDate();
            month = month < 10 ? '0' + month : month;
            day = day < 10 ? '0' + day : day;

            return newDate.getFullYear() + '-' + month + '-' + day;
        }

        const summarize = (summaryContext) => {
            log.debug('结束');
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

        //减法
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

        function keepTwoDecimalFull(num) {
            if (num == '' || num == 'null' || num == null || num == undefined || num == 'undefined' || num == ' ') {
                return '0.00';
            }
            if (num == 0) {
                return '0.00';
            }
            var result = parseFloat(num);
            if (isNaN(result)) {
                alert('传递参数错误，请检查！');
                return false;
            }
            result = Math.round(num * 100) / 100;
            var s_x = result.toString();
            var pos_decimal = s_x.indexOf('.');
            if (pos_decimal < 0) {
                pos_decimal = s_x.length;
                s_x += '.';
            }
            while (s_x.length <= pos_decimal + 2) {
                s_x += '0';
            }
            return s_x;
        }

        return {getInputData, map, reduce, summarize}

    });