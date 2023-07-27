/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 1.0 2019-08-15 marvin 购汇/结汇单确认后产生日记账
 * 1.3 2022-05-11 marvin 修改生成日记账逻辑
 * 1.4 2023-05-06 Anne Hu cs字段赋值逻辑新增到ue中
 */
define(['N/record', 'N/runtime', 'N/search', 'N/format', 'N/file', 'N/task', 'N/currency'],
    /**
     * @param {record} record
     * @param {runtime} runtime
     * @param {search} search
     */
    function (record, runtime, search, format, file, task, currency) {
     
        /**
         * Function definition to be triggered before record is loaded.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {string} scriptContext.type - Trigger type
         * @param {Form} scriptContext.form - Current form
         * @Since 2015.2
         */
        function beforeLoad(scriptContext) {
        }

        /**
         * Function definition to be triggered before record is loaded.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type
         * @Since 2015.2
         */
        function beforeSubmit(scriptContext) {
            try{
                var rec = scriptContext.newRecord;
                if (scriptContext.type != 'delete' && scriptContext.type != 'xedit' && 
                !rec.getValue('custrecord_hc_btf_pay_transaction') && 
                !rec.getValue('custrecord_hc_btf_deposit_transaction') && 
                !rec.getValue('custrecord_hc_btf_gain_loss_transaction')) {
                    setFinancialAndActualRate(rec);
                }
            }catch(e) {
                log.debug('error', e.message + ';' + e.stack);
            }
            
        }

        /**
         * Function definition to be triggered before record is loaded.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type
         * @Since 2015.2
         */
        function afterSubmit(scriptContext) {
            log.debug('ue afterSubmit step0', 'executionContext = ' + runtime.executionContext);
            var userObj = runtime.getCurrentUser();
            var userRole = userObj.role;
            var updFlg = false;
            if (scriptContext.type != 'delete' && scriptContext.type != 'xedit') {
                var newRec = scriptContext.newRecord;
                var id = newRec.getValue({fieldId: 'id'});
                log.debug('购汇单ID', id);
                var newStatus = newRec.getValue({fieldId: 'custrecord_hc_btf_status'});//获取单据状态做判断
                var nowDate = getOffsetZoneDate(8); //new Date();
                var useDate = newRec.getValue({fieldId: 'custrecord_hc_btf_tran_date'});
                var nowTrandate = format.parse({value: nowDate, type: format.Type.DATE});
                var nowPostingperiod = getNowOpenPeriod(useDate);
                log.debug('ue afterSubmit step1', 'nowTrandate = ' + nowTrandate + '  :nowPostingperiod = ' + nowPostingperiod);
              //Anne Hu 新增 购汇汇率和记账汇率的赋值custrecord_hc_btf_financial_rate custrecord_hc_btf_actual_rate
                            // if(runtime.executionContext == 'CSVIMPORT') {
                            //         setFinancialAndActualRate(newRec)
                            // }
                //记录生成的单据ID
                var bscId;
                var bscId2;
                var bscID3;
                var ori_bscId = newRec.getValue({fieldId: 'custrecord_hc_btf_pay_transaction'});//存日记账
                var updFlg = false;
                //状态变为已确认，创建日记账
                if (newStatus == '2' && nowPostingperiod) {
                    try {
                        var acObj = {};
                        acObj.nowTrandate = nowTrandate;
                        acObj.nowPostingperiod = nowPostingperiod;
                        if (ori_bscId) {
                            bscId = ori_bscId;
                        } else {
                            var idObj = dealBankTransferJe(newRec, acObj);
                            bscId = idObj.id1;
                            bscId2 = idObj.id2;
                            bscId3 = idObj.id3;
                            updFlg = true;
                        }

                        //生成的JE回写原单据
                        if (updFlg) {
                            var newRecFroUpd = record.load({type: 'customrecord_hc_bank_transfer_order', id: id, isDynamic: true});
                            if (bscId) {
                                newRecFroUpd.setValue('custrecord_hc_btf_pay_transaction', bscId);
                            }
                            if (bscId2) {
                                newRecFroUpd.setValue('custrecord_hc_btf_deposit_transaction', bscId2);
                            }
                            if (bscId3) {
                                newRecFroUpd.setValue('custrecord_hc_btf_gain_loss_transaction', bscId3);
                            }
                            newRecFroUpd.save();
                        }

                    } catch (e) {
                        log.error('ue afterSubmit error', e);
                    }
                }
            }
            log.debug('ue afterSubmit step9', 'afterSubmit end');
        }

        function getOffsetZoneDate(offsetZone) {
            var nowServer = new Date();
            var moffset = nowServer.getTimezoneOffset();
            var nowOffset = new Date(nowServer.getTime() + ((offsetZone * 60 + moffset) * 60 * 1000));

            return nowOffset;
        }

        //取得当天对应的打开状态的账期
        function getNowOpenPeriod(nowDate) {
            //var nowDate = new Date();
            //var useDate = newRec.getValue({ fieldId :'custrecord_hc_btf_tran_date' });
            //var nowTrandate = format.parse({ value : nowDate, type : format.Type.DATE });
            var nowTrandate = getCurrentDateFormateByDate(nowDate);
            var nowPostingperiod;
            try {
                var b_filters = [];
                b_filters.push(search.createFilter({name: 'closed', operator: search.Operator.IS, values: 'F'}));
                b_filters.push(search.createFilter({name: 'isyear', operator: search.Operator.IS, values: 'F'}));
                b_filters.push(search.createFilter({name: 'isquarter', operator: search.Operator.IS, values: 'F'}));
                b_filters.push(search.createFilter({name: 'startdate', operator: search.Operator.ONORBEFORE, values: nowTrandate}));
                b_filters.push(search.createFilter({name: 'enddate', operator: search.Operator.ONORAFTER, values: nowTrandate}));
                var b_columns = [];
                b_columns.push(search.createColumn({name: 'internalid'}));
                var tmpSearch = search.create({type: 'accountingperiod', filters: b_filters, columns: b_columns});
                var res = tmpSearch.run().getRange({start: 0, end: 10});
                if (res && res.length > 0) {
                    nowPostingperiod = res[0].getValue(b_columns[0]);
                }
            } catch (e) {
                log.error('UE_hc_on_ce_comfirm afterSubmit getNowOpenPeriod error', e);
            }
            return nowPostingperiod;
        }

        function getCurrentDateFormateByDate(date) {
            return getCurrentDateFormate(date.getFullYear(), date.getMonth() + 1, date.getDate());
        }

        //获取当前用户的时间格式
        function addZero(number) {
        return number > 9 ? number : ('0' + number);
    }
        function getCurrentDateFormate(year, month, day) {
            var userObj = runtime.getCurrentUser();
            var s_context = userObj.getPreference({name: "DATEFORMAT"});
            if (s_context == 'YYYY年M月D日' || s_context == 'YYYY年MM月DD日') {
                return year + '年' + month + '月' + day + '日';
            } else if (s_context == 'YYYY-M-D' || s_context == 'YYYY-MM-DD') {
                return year + '-' + month + '-' + day;
            } else if (s_context == 'YYYY M D' || s_context == 'YYYY MM DD') {
                return year + ' ' + month + ' ' + day;
            } else if (s_context == 'YYYY/M/D' || s_context == 'YYYY/MM/DD') {
                return year + '/' + addZero(month) + '/' + addZero(day);
            } else if (s_context == 'M/D/YYYY' || s_context == 'MM/DD/YYYY') {
                return month + '/' + day + '/' + year;
            } else if (s_context == 'D/M/YYYY' || s_context == 'DD/MM/YYYY') {
                return day + '/' + month + '/' + year;
            } else if (s_context == 'D-Mon-YYYY' || s_context == 'DD-Mon-YYYY') {
                return day + '-' + month + '-' + year;
            } else if (s_context == 'D.M.YYYY' || s_context == 'DD.MM.YYYY') {
                return day + '.' + month + '.' + year;
            }
        }

        //购汇、结汇日记账
        function dealBankTransferJe(newRec, acObj) {
            var id1;
            var id2;
            var amount_pay = newRec.getValue({fieldId: 'custrecord_hc_btf_paid_amount'});
            var amount_dep = newRec.getValue({fieldId: 'custrecord_hc_btf_get_amount'});
            if (amount_pay && !isNaN(amount_pay)) {
                var subsidiary = newRec.getValue({fieldId: 'custrecord_hc_btf_main_subsidiary'});//主体公司
                var date = newRec.getValue({fieldId: 'custrecord_hc_btf_tran_date'});//交易时间
                var ghd = newRec.getValue({fieldId: 'id'});
                log.debug('ghd', ghd);
                var account_pay = newRec.getValue({fieldId: 'custrecord_hc_btf_from_account'});//自科目
                var account_dep = newRec.getValue({fieldId: 'custrecord_hc_btf_to_account'});//至科目
                var account_hd = newRec.getValue({fieldId: 'custrecord_hc_btf_exchange_account'});//汇兑损益科目
                var account_tst = newRec.getValue({fieldId: 'custrecord_hc_btf_intransit_account'});//资金在途科目
                var currency_pay = newRec.getValue({fieldId: 'custrecord_hc_btf_from_account_currency'});//自货币币种
                var currency_dep = newRec.getValue({fieldId: 'custrecord_hc_btf_to_account_currency'});//至货币币种
                var currency_bwb = newRec.getValue({fieldId: 'custrecord_hc_btf_base_currency'});//公司本位币
              	var subtype = newRec.getValue({fieldId: 'custrecord_hc_btf_sub_type'});//子类型 1：汇益，2：汇损
              	log.debug('损益类型', subtype);
                var rate_pt = newRec.getValue({fieldId: 'custrecord_hc_btf_from_account_rate'});//支付币种到本位币汇率
                var rate_dt = newRec.getValue({fieldId: 'custrecord_hc_btf_to_account_rate'});//购进币种到本位币汇率
                var rate1 = '';
                if (currency_bwb && currency_dep) {
                    rate1 = currency.exchangeRate({source: currency_dep, target: currency_bwb, date: date});
                    log.debug('买进货币币种与公司本位币汇率', rate1);
                }
                var rate2 = '';
                if (currency_bwb && currency_pay) {
                    rate2 = currency.exchangeRate({source: currency_pay, target: currency_bwb, date: date});
                    log.debug('卖出货币币种与公司本位币汇率', rate2);
                }
                var amount_pay = dealRateFix(newRec.getValue({fieldId: 'custrecord_hc_btf_paid_amount'}), rate2);//支付金额
                var amount_dep = dealRateFix(newRec.getValue({fieldId: 'custrecord_hc_btf_get_amount'}), rate1);//购进金额
                var amount_pt = Number(amount_pay)*Number(rate_pt);//支付金额换算本币金额
                var amount_pt = Number(amount_pt).toFixed(2);
                var amount_dt = Number(amount_dep)*Number(rate_dt);//购进金额换算本币金额
                var amount_dt = Number(amount_dt).toFixed(2);
                var amount_hd = Number(amount_pt)- Number(amount_dt);
                log.debug('amount_hd', amount_hd);
                var amount_payz = newRec.getValue({fieldId: 'custrecord_hc_btf_from_transit_amount'});//中转科目金额（自）
                var amount_tz = dealRateFix(newRec.getValue({fieldId: 'custrecord_hc_btf_to_transit_amount'}), rate1);//中转科目金额（至）
                log.debug('中转科目金额至', amount_tz);
                var amount_hs = newRec.getValue({fieldId: 'custrecord_hc_btf_convert_to_base_amount'});//换算本位币金额
                if (rate1 < 0.01) {
                    amount_hs = dealRateFix(amount_hs, rate1);
                } else {
                    amount_hs = dealRateFix(amount_hs, rate2);
                }
                log.debug('汇兑金额', amount_hs);

                //创建日记账
                var jeRec = record.create({type: 'journalentry'});
                if (amount_pay){
                    //创建付汇日记账
                    jeRec.setValue({fieldId: 'subsidiary', value: subsidiary});
                    jeRec.setValue({fieldId: 'postingperiod', value: acObj.nowPostingperiod});
                    //jeRec.setValue({ fieldId : 'trandate', value : acObj.nowTrandate });
                    jeRec.setValue({fieldId: 'currency', value: currency_pay});
                    jeRec.setValue({fieldId: 'trandate', value: date});
                    jeRec.setValue({fieldId: 'custbody_hc_create_from_btf', value: ghd});
                    jeRec.setValue({fieldId: 'approvalstatus', value: '2'}); //已核准
                    //借方明细行
                    jeRec.setSublistValue({sublistId: 'line', fieldId: 'account', value: account_tst, line: 0});//借方科目
                    jeRec.setSublistValue({sublistId: 'line', fieldId: 'debit', value: amount_pay, line: 0});//借方金额
                    jeRec.setSublistValue({sublistId: 'line', fieldId: 'memo', value: '收付汇交易', line: 0});
                    //jeRec.setSublistValue({sublistId: 'line', fieldId: 'custcol_cseg_cn_cfi', value: '3', line: 0});
                    //贷方明细行
                    jeRec.setSublistValue({sublistId: 'line', fieldId: 'account', value: account_pay, line: 1});
                    jeRec.setSublistValue({sublistId: 'line', fieldId: 'credit', value: amount_pay, line: 1});
                    jeRec.setSublistValue({sublistId: 'line', fieldId: 'memo', value: '收付汇交易', line: 1});
                    id1 = jeRec.save();
                    
                    var jeRec2 = record.create({type: 'journalentry'});
                    jeRec2.setValue({fieldId: 'subsidiary', value: subsidiary});
                    jeRec2.setValue({fieldId: 'postingperiod', value: acObj.nowPostingperiod});
                    //jeRec.setValue({ fieldId : 'trandate', value : acObj.nowTrandate });
                    jeRec2.setValue({fieldId: 'currency', value: currency_dep});
                    jeRec2.setValue({fieldId: 'trandate', value: date});
                    jeRec2.setValue({fieldId: 'custbody_hc_create_from_btf', value: ghd});
                    jeRec2.setValue({fieldId: 'approvalstatus', value: '2'}); //已核准
                    //借方明细行
                    jeRec2.setSublistValue({sublistId: 'line', fieldId: 'account', value: account_dep, line: 0});//借方科目
                    jeRec2.setSublistValue({sublistId: 'line', fieldId: 'debit', value: amount_dep, line: 0});//借方金额
                    jeRec2.setSublistValue({sublistId: 'line', fieldId: 'memo', value: '收付汇交易', line: 0});

                    //贷方明细行
                    jeRec2.setSublistValue({sublistId: 'line', fieldId: 'account', value: account_tst, line: 1});
                    jeRec2.setSublistValue({sublistId: 'line', fieldId: 'credit', value: amount_dep, line: 1});
                    //jeRec2.setSublistValue({sublistId: 'line', fieldId: 'custcol_cseg_cn_cfi', value: '3', line: 1});
                    jeRec2.setSublistValue({sublistId: 'line', fieldId: 'memo', value: '收付汇交易', line: 1});
                    id2 = jeRec2.save();
                  
                  	//创建汇兑日记账
                    var jeRec3 = record.create({type: 'journalentry'});
                    jeRec3.setValue({fieldId: 'subsidiary', value: subsidiary});
                    jeRec3.setValue({fieldId: 'postingperiod', value: acObj.nowPostingperiod});
                    //jeRec.setValue({ fieldId : 'trandate', value : acObj.nowTrandate });
                    jeRec3.setValue({fieldId: 'currency', value: currency_bwb});
                    jeRec3.setValue({fieldId: 'trandate', value: date});
                    jeRec3.setValue({fieldId: 'custbody_hc_create_from_btf', value: ghd});
                    jeRec3.setValue({fieldId: 'approvalstatus', value: '2'}); //已核准
                  	if ( subtype == '2' ){
                    //借方明细行
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'account', value: account_hd, line: 0});//借方科目
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'debit', value: amount_hd, line: 0});//借方金额
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'memo', value: '收付汇汇兑记账', line: 0});
                    //贷方明细行
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'account', value: account_tst, line: 1});
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'credit', value: amount_hd, line: 1});
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'memo', value: '收付汇汇兑记账', line: 1});
                    } else {
                    //借方明细行
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'account', value: account_hd, line: 0});//借方科目
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'debit', value: amount_hd, line: 0});//借方金额
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'memo', value: '收付汇汇兑记账', line: 0});
                    //贷方明细行
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'account', value: account_tst, line: 1});
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'credit', value: amount_hd, line: 1});
                    jeRec3.setSublistValue({sublistId: 'line', fieldId: 'memo', value: '收付汇汇兑记账', line: 1});
                      }
                    id3 = jeRec3.save();
                } 
            }
            var rtnObj = {};
            rtnObj.id1 = id1;
            rtnObj.id2 = id2;
            rtnObj.id3 = id3;
            return rtnObj;
        }

        function keep7decimal(num) {
            return Math.round(num * 10000000) / 10000000;
        }

        function keep4decimal(num) {
            return Math.round(num * 10000) / 10000;
        }

        function keep2decimal(num) {
            return Math.round(num * 100) / 100;
        }

        function dealRateFix(tarVal, rate) {
            if (isNaN(tarVal)) {
                return  tarVal;
            }
            tarVal = Number(tarVal);
            if (isNaN(rate)) {
                tarVal = tarVal.toFixed(2);
            } else {
                rate = Number(rate);
                if (rate < 0.01) {
                    tarVal = tarVal.toFixed(0);
                } else {
                    tarVal = tarVal.toFixed(2);
                }
            }
            return tarVal;
        }
//2023.5.6
            //购汇汇率和记账汇率的赋值
            function setFinancialAndActualRate(rec) {
                    // var rec = record.load({
                    //         type:newRec.type,
                    //         id:newRec.id
                    // })
                    var currency_f = rec.getValue({fieldId: 'custrecord_hc_btf_from_account_currency'});//自货币币种
                    var currency_t = rec.getValue({fieldId: 'custrecord_hc_btf_to_account_currency'});//至货币币种
                    var currency_bwb = rec.getValue('custrecord_hc_btf_base_currency'); //公司本位币
                    var trandate = rec.getValue('custrecord_hc_btf_tran_date');
                    if (currency_f) {
                            var tmpRate = currency.exchangeRate({ source: currency_f, target: currency_bwb, date: trandate });
                            rec.setValue({ fieldId: 'custrecord_hc_btf_from_account_rate', value: tmpRate});
                    }
                    if (currency_t) {
                            var tmpRate = currency.exchangeRate({ source: currency_t, target: currency_bwb, date: trandate });
                            var rate_hz = tmpRate;
                            rec.setValue({ fieldId: 'custrecord_hc_btf_to_account_rate', value: tmpRate});
                    }
                    if (currency_f && currency_t && trandate) {
                            var tmpRate = currency.exchangeRate({ source: currency_f, target: currency_t, date: trandate });
                            var rate_jz = tmpRate;
                            rec.setValue({ fieldId: 'custrecord_hc_btf_financial_rate', value: tmpRate});
                    }
                    var amount_f = rec.getValue('custrecord_hc_btf_paid_amount'); //支付金额
                    var amount_t = rec.getValue('custrecord_hc_btf_get_amount'); //购进金额
                    if (amount_f && amount_t) {
                            var tmpRate = keep8decimal(Number(accDiv(amount_t, amount_f)));
                            rec.setValue({ fieldId: 'custrecord_hc_btf_actual_rate', value: tmpRate});
                    }
                    var jz_rate = nullToZero(rec.getValue('custrecord_hc_btf_financial_rate'));
                    var gh_rate = nullToZero(rec.getValue('custrecord_hc_btf_actual_rate'));
                    if (gh_rate > jz_rate) {
                            rec.setValue({ fieldId: 'custrecord_hc_btf_sub_type', value: '1'});
                    } else {
                            rec.setValue({ fieldId: 'custrecord_hc_btf_sub_type', value: '2'});
                    }
                    dealMiddleAmount(rec)
                    var kbn = '1';
                    if (currency_f != currency_t && currency_f == currency_bwb) {
                            kbn = '2';
                    } else if (currency_f != currency_t && currency_t == currency_bwb) {
                            kbn = '3';
                    }
                    rec.setValue({ fieldId: 'custrecord_hc_btf_type', value: kbn});
                    var type = kbn;
                    if (amount_f && type == '2') {
                            var tmphs = Number(amount_f)/Number(rate_hz);//03-10：rate_jz>>rate_hz,改用除法
                            rec.setValue({ fieldId: 'custrecord_hc_btf_convert_to_base_amount', value: tmphs});
                    }
                    if (amount_f && type == '3') {
                            var tmphs = Number(amount_t)/Number(rate_jz);
                            rec.setValue({ fieldId: 'custrecord_hc_btf_convert_to_base_amount', value: tmphs});
                    }
                    // rec.save({ignoreMandatoryFields:true,enableSourcing:true})
            }
            function accDiv(arg1, arg2) {
                    var t1 = 0,
                        t2 = 0,
                        r1, r2;
                    try {
                            t1 = arg1.toString().split(".")[1].length
                    } catch (e) {}
                    try {
                            t2 = arg2.toString().split(".")[1].length
                    } catch (e) {}
                    with(Math) {
                            r1 = Number(arg1.toString().replace(".", ""))
                            r2 = Number(arg2.toString().replace(".", ""))
                            return (r1 / r2) * pow(10, t2 - t1);
                    }
            }
            function accMul(arg1, arg2) {
                    var m = 0,
                        s1 = arg1.toString(),
                        s2 = arg2.toString();
                    try {
                            m += s1.split(".")[1].length
                    } catch (e) {}
                    try {
                            m += s2.split(".")[1].length
                    } catch (e) {}
                    return Number(s1.replace(".", "")) * Number(s2.replace(".", "")) / Math.pow(10, m)
            }
            function nullToZero(str) {
                    if (str){
                            return str;
                    } else {
                            return '0';
                    }
            }
            function dealMiddleAmount(currentRecord) {
                    var rate_f = currentRecord.getValue('custrecord_hc_btf_from_account_rate');
                    var rate_t = currentRecord.getValue('custrecord_hc_btf_to_account_rate');
                    var amount_f = currentRecord.getValue('custrecord_hc_btf_paid_amount');
                    var amount_t = currentRecord.getValue('custrecord_hc_btf_get_amount');
                    var amount_zz;
                    if (rate_f && amount_f) {
                            amount_zz = keep8decimal(Number(accMul(amount_f, rate_f)));
                            currentRecord.setValue({ fieldId: 'custrecord_hc_btf_from_transit_amount', value: amount_zz});
                    }
                    if (rate_t && amount_zz) {
                            var tmpAmount = keep8decimal(Number(accDiv(amount_zz, rate_t)));
                            currentRecord.setValue({ fieldId: 'custrecord_hc_btf_to_transit_amount', value: tmpAmount});
                    }
            }
            function keep8decimal(num){
                    return Math.round(num * 100000000) / 100000000;
            }
        return {
            beforeLoad: beforeLoad,
            beforeSubmit: beforeSubmit,
            afterSubmit: afterSubmit
        };
    });