/**
 * eBay创建平台结算
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', './util/moment', 'N/search', 'N/runtime'], 
(record, moment, search, runtime) => {

    const getInputData = () => {
        try{
            return getEbayTransactions();
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const map = (context) => {
        try{
            let order = JSON.parse(context.value);
            let rec = record.create({
                type: 'customrecord_hc_plat_settle'
            });
            for(let key in order){
                if(key == 'custrecord_hc_ps_currency' || key == 'custrecord_hc_ps_transac_type' || key == 'custrecord_hc_ps_amount_type') {
                    rec.setText(key, order[key]);
                }else if(key == 'custrecord_hc_ps_date'){
                    rec.setValue(key, moment(order[key]).toDate());
                }else if(key == 'id'){}else{
                    rec.setValue(key, order[key]);
                }
            }
            let recId = rec.save();
            log.debug('平台结算内部标识', recId);
            record.submitFields({
                type: 'customrecord_ebay_transaction',
                id: order.id,
                values:{
                    'custrecord_ebay_ts_plat_settle': recId,
                    'custrecord_ebay_ts_ns_status': 'CREATE_PS'
                }
            })
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const reduce = (context) => {
        
    }

    const summarize = (summary) => {
        
    }

    //SALE：63802,REFUND：64003
    const getEbayTransactions = () => {
        let transactionList = [];
        let searchId = runtime.getCurrentScript().getParameter('custscript_eaay_ts2ps_searchid');
        search.load(searchId).run().each(function(result) {
            let store = search.lookupFields({
                type: 'customrecord_hc_seller_profile',
                id: result.getValue('custrecord_ebay_ts_store'),
                columns: ['custrecord_hc_sp_owned_subsidiary', 'custrecord_hc_sp_sales_channel', 'custrecord_hc_sp_customer']
            });
            transactionList.push({
                id: result.id,
                custrecord_hc_ps_date: result.getValue('custrecord_ebay_transaction_date'), //过账日期
                custrecord_hc_ps_profile: result.getValue('custrecord_ebay_ts_store'),  //店铺
                custrecord_hc_ps_subsidiary: store.custrecord_hc_sp_owned_subsidiary[0].value, //所属公司
                custrecord_hc_ps_customer: store.custrecord_hc_sp_customer[0].value, //客户
                custrecord_hc_ps_currency: result.getValue('custrecord_ebay_ts_amount_currency'), //结算币种
                custrecord_hc_ps_sales_channel: store.custrecord_hc_sp_sales_channel[0].value, //销售平台
                custrecord_hc_ps_orderid: result.getValue('custrecord_ebay_transaction_orderid'),  //订单号
                custrecord_hc_ps_transacid: result.getValue('custrecord_ebay_transaction_id'), //结算单号
                custrecord_hc_ps_transac_type: result.getValue('custrecord_ebay_transaction_type'),  //交易类型
                custrecord_hc_ps_amount_type: result.getValue('custrecord_ebay_transaction_type'), //金额类型
                custrecord_hc_ps_sales: result.getValue('custrecord_ebay_ts_totalfeebasisamount'), //收入金额
                custrecord_hc_ps_palt_commission: result.getValue('custrecord_ebay_ts_totalfeeamount'), //平台佣金
                custrecord_hc_ps_settle_total: result.getValue('custrecord_ebay_ts_amount'), //结算总额
                custrecord_hc_ps_paymentid: result.getValue('custrecord_ebay_trancation_payoutid'), //支付单号
            });
            if(!result.getValue('custrecord_ebay_ts_totalfeebasisamount') && !result.getValue('custrecord_ebay_ts_totalfeeamount')){
                transactionList[transactionList.length - 1].custrecord_hc_ps_sales = result.getValue('custrecord_ebay_ts_amount')
            }
            return true;
        });
        log.debug('transactionList', transactionList);
        return transactionList;
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});
