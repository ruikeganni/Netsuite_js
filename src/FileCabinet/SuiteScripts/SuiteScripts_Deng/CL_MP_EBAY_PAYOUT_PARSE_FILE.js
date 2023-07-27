/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', 'N/search', 'N/file'], 
(record, search, file) => {

    const ebayPlatform = 5;
    const paymentType = 3;  //接口类型Payment

    const getInputData = () => {
        return getParseFileList();
    }

    const map = (context) => {
        try{
            let value = JSON.parse(context.value);
            let fileRec = record.load({
                type: 'customrecord_file_analysis_list',
                id: value.id
            });
            let orderFileText = file.load({
                id: fileRec.getValue('custrecord_file_url')
            }).getContents();

            let response = JSON.parse(orderFileText);
            let payoutList = response.payouts;
            let payoutIds = [];
            for(let key in payoutList) {
                payoutIds[payoutIds.length] = payoutList[key].payoutId;
            }
            let searchPayoutObj = searchPayout(payoutIds);
            let payoutObjList = [];
            for(let key in payoutList) {
                let payoutObj = parsePayout(payoutList[key],fileRec);
                payoutObjList[key] = payoutObj;
            }
            context.write({
                key: value.id,
                value: {
                    'searchPayoutObj': searchPayoutObj,
                    'payoutList': payoutObjList
                }
            });
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const reduce = (context) => {
        try{
            let payoutList = JSON.parse(context.values[0]).payoutList;
            let searchPayoutObj = JSON.parse(context.values[0]).searchPayoutObj;
            log.debug('searchPayoutObj', searchPayoutObj);
            for(let key in payoutList) {
                let recId = createPayout(payoutList[key], searchPayoutObj);
                log.debug('Ebay: 财务数据内部标识', recId);
            }
            record.submitFields({
                type:'customrecord_file_analysis_list',
                id: context.key,
                values:{
                    'custrecordanalysis_status': true
                }
            });
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const summarize = (summary) => {
        log.debug('', 'end');
    }

    const createPayout = (payout, searchPayoutObj) => {
        let recId = searchPayoutObj[payout.custrecord_ebay_payout_payoutid];
        let rec = recId?record.load({
            type: 'customrecord_ebay_payout',
            id: recId
        }):record.create({
            type: 'customrecord_ebay_payout'
        });
        for(let key in payout){
            rec.setValue(key, payout[key]);
        }
        rec.setValue('name', payout.custrecord_ebay_payout_payoutid);
        rec.setValue('custrecord_ebay_payout_transaction_downl', false);
        return rec.save();
    }

    const parsePayout = (payout ,fileRec) => {
        let payoutObj = {};
        payoutObj.custrecord_ebay_payout_ns_status = 'PLATFORM_ORDER'; //NS状态
        payoutObj.custrecord_ebay_payout_store = fileRec.getValue('custrecord_seller_dev_1');  //店铺账号
        payoutObj.custrecord_ebay_payout_json = JSON.stringify(payout);
        payoutObj.custrecord_ebay_payout_parse_file_list = fileRec.id;

        payoutObj.custrecord_ebay_payout_payoutid = payout.payoutId;
        payoutObj.custrecord_ebay_payout_payoutstatus = payout.payoutStatus;
        payoutObj.custrecord_ebay_payout_payoutstatusdescr = payout.payoutStatusDescription;
        if(payout.amount){
            payoutObj.custrecord_amount = payout.amount.value;
            payoutObj.custrecord_ebay_payout_currency = payout.amount.currency;
        }
        payoutObj.custrecord_ebay_payout_payoutdate = payout.payoutDate;
        payoutObj.custrecord_ebay_payout_lastattemptedpayo = payout.lastAttemptedPayoutDate;
        payoutObj.custrecord_ebay_payout_transactioncount = payout.transactionCount;

        if(payout.payoutInstrument){
            payoutObj.custrecord_ebay_payout_pi_instrumenttype = payout.payoutInstrument.instrumentType;
            payoutObj.custrecord_ebay_payout_pi_nickname = payout.payoutInstrument.nickname;
            payoutObj.custrecord_ebay_payout_pi_accountlastfou = payout.payoutInstrument.accountLastFourDigits;
        }

        payoutObj.custrecord_ebay_payout_payoutmemo = payout.payoutMemo;
        return payoutObj;
    }

    /**
     * 根据payoutId搜索Ebay: 财务数据
     * @param {*} payoutIds []
     */
    const searchPayout = (payoutIds) => {
        let filters = [];
        for(let i in payoutIds){
            if(i == 0){
                filters[filters.length] = ['custrecord_ebay_payout_payoutid','is',payoutIds[i]];
            }else{
                filters[filters.length] = 'OR';
                filters[filters.length] = ['custrecord_ebay_payout_payoutid','is',payoutIds[i]];
            }
        }
        let searchPayoutObj = {};
        let searchPayout = search.create({
            type: 'customrecord_ebay_payout',
            filters: filters,
            columns: ['custrecord_ebay_payout_payoutid']
        });
        searchPayout.run().each(function(result){
            searchPayoutObj[result.getValue('custrecord_ebay_payout_payoutid')] = result.id;
            return true;
        });
        return searchPayoutObj;
    }

    const getParseFileList = () => {
        let allFile = [];
        search.create({
            type: 'customrecord_file_analysis_list',
            filters:
                [
                    ['custrecord_sales_platform','is',ebayPlatform],'AND',
                    ['custrecord_data_type','is',paymentType],'AND',
                    ['custrecordanalysis_status','is',false]
                ],
            columns: []
        }).run().each(function(result) {
            let obj = result;
            allFile[allFile.length] = obj;
            if(allFile.length < 10){
                return true;
            }
        });
        log.debug('allFile.length', allFile.length);
        return allFile;
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});
