/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', 'N/search', 'N/file'], 
(record, search, file) => {

    const ebayPlatform = 5;
    const transactionType = 4;

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
            let fileText = file.load(fileRec.getValue('custrecord_file_url')).getContents();

            let transactions = JSON.parse(fileText).transactions;
            let transactionIds = transactions.map(o => o.transactionId);
            let transactionObjList = [];
            for(let key in transactions) {
                transactionObjList[key] = parseTransaction(transactions[key], fileRec);
            }
            context.write({
                key: value.id,
                value: {
                    searchTransationObj: searchTransaction(transactionIds),
                    transactionList: transactionObjList
                }
            });
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const reduce = (context) => {
        try{
            let val = JSON.parse(context.values[0]);
            let transactionList = val.transactionList;
            let searchTransationObj = val.searchTransationObj;
            for(let key in transactionList) {
                let transaction = transactionList[key];
                let transactionNsId = createTransaction(transaction,searchTransationObj);
                log.debug('Ebay: 财务数据Transaction内部标识', transactionNsId);

                if(!searchTransationObj[transaction.custrecord_ebay_transaction_id]) {
                    log.debug('createItem', transaction.custrecord_ebay_transaction_id);
                    search.create({
                        type: 'customrecord_ebay_transaction_item',
                        filters: [
                            ['custrecord_ebay_transaction','is', transactionNsId]
                        ],
                        columns: []
                    }).run().each(function(result) {
                        record.delete('customrecord_ebay_transaction_item', result.id)
                    });
                    let orderLineItems = transaction['orderLineItems'];
                    for(let itemKey in orderLineItems){
                        let itemNsId = createTransactionItem(transactionNsId, orderLineItems[itemKey]);
                        log.debug('Ebay: Transaction_Item内部标识', itemNsId);
                    }
                }
            }
            record.submitFields({
                type: 'customrecord_file_analysis_list',
                id: context.key,
                values:{
                    custrecordanalysis_status: true
                }
            });
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const summarize = (summary) => {
        log.debug('', 'end');
    }

    /**
     * 创建Ebay: Transaction_Item 记录
     * @param {*} transactionNsId 
     * @param {*} lineItem 
     * @returns 
     */
    const createTransactionItem = (transactionNsId, lineItem) => {
        let rec = record.create({
            type: 'customrecord_ebay_transaction_item'
        });
        for(let key in lineItem) {
            rec.setValue(key, lineItem[key]);
        }
        rec.setValue('name', lineItem['custrecord_ebay_ts_item_lineitemid']);
        rec.setValue('custrecord_ebay_transaction', transactionNsId);
        return rec.save();
    }

    /**
     * 创建Ebay: 财务数据Transaction 记录
     * @param {*} transaction 
     * @param {*} searchTransationObj 
     * @returns 
     */
    const createTransaction = (transaction, searchTransationObj) => {
        let recId = searchTransationObj[transaction.custrecord_ebay_transaction_id];
        let rec = recId ? record.load({
            type: 'customrecord_ebay_transaction',
            id: recId
        }):record.create({
            type: 'customrecord_ebay_transaction'
        });
        for(let key in transaction) {
            rec.setValue(key, transaction[key]);
        }
        rec.setValue('name', transaction['custrecord_ebay_transaction_id']);
        return rec.save();
    }

    const parseTransaction = (transaction, fileRec) => {
        let transactionObj = {};
        transactionObj.custrecord_ebay_transaction_id = transaction.transactionId;
        transactionObj.custrecord_ebay_transaction_orderid = transaction.orderId;
        transactionObj.custrecord_ebay_trancation_payoutid = transaction.payoutId;
        transactionObj.custrecord_ebay_ts_salesrecordreference = transaction.salesRecordReference;
        transactionObj.custrecord_ebay_transaction_type = transaction.transactionType;

        if(transaction.buyer) {
            transactionObj.custrecord_ebay_ts_buyer_username = transaction.buyer.username;
        }
        
        if(transaction.amount) {
            transactionObj.custrecord_ebay_ts_amount = transaction.amount.value;
            transactionObj.custrecord_ebay_ts_amount_currency = transaction.amount.currency;
        }
        
        if(transaction.totalFeeBasisAmount) {
            transactionObj.custrecord_ebay_ts_totalfeebasisamount = transaction.totalFeeBasisAmount.value;
            transactionObj.custrecord_ebay_ts_totalfeebasisamount_c = transaction.totalFeeBasisAmount.currency;
        }
        
        if(transaction.totalFeeAmount) {
            transactionObj.custrecord_ebay_ts_totalfeeamount = transaction.totalFeeAmount.value;
            transactionObj.custrecord_ebay_ts_totalfeeamount_curren = transaction.totalFeeAmount.currency;    
        }
        
        transactionObj.custrecord_ebay_transaction_bookingentry = transaction.bookingEntry;
        transactionObj.custrecord_ebay_transaction_date = transaction.transactionDate;
        transactionObj.custrecord_ebay_transaction_status = transaction.transactionStatus;
        transactionObj.custrecord_ebay_ts_paymentsentity = transaction.paymentsEntity;
        transactionObj.custrecord_ebay_ts_references = JSON.stringify(transaction.references);
        transactionObj.custrecord_ebay_transaction_json = JSON.stringify(transaction);
        transactionObj.custrecord_ebay_ts_parse_file_list = fileRec.id
        transactionObj.custrecord_ebay_ts_store = fileRec.getValue('custrecord_seller_dev_1');
        transactionObj.custrecord_ebay_ts_ns_status = 'PLATFORM_ORDER';

        let orderLineItems = [];
        for(let key in transaction.orderLineItems) {
            let itemObj = {};
            let item = transaction.orderLineItems[key];
            itemObj.custrecord_ebay_ts_item_lineitemid = item.lineItemId;
            if(item.feeBasisAmount){
                itemObj.custrecord_ebay_ts_feebasisamount = item.feeBasisAmount.value;
                itemObj.custrecord_ebay_ts_item_feebasisamount_c = item.feeBasisAmount.currency;
            }
            itemObj.custrecord_ebay_ts_item_lineitemid = item.lineItemId;
            itemObj.custrecord_ebay_ts_item_marketplacefees = JSON.stringify(item.marketplaceFees);
            orderLineItems[key] = itemObj;
        }
        transactionObj['orderLineItems'] = orderLineItems;
        return transactionObj;
    }

    /**
     * 根据transactionId搜索Ebay: 财务数据Transaction
     * @param {*} payoutIds []
     */
    const searchTransaction = (transactionIds) => {
        let filters = [];
        for(let i in transactionIds) {
            if(i == 0) {
                filters[filters.length] = ['custrecord_ebay_transaction_id', 'is', transactionIds[i]];
            }else {
                filters[filters.length] = 'OR';
                filters[filters.length] = ['custrecord_ebay_transaction_id', 'is', transactionIds[i]];
            }
        }
        let searchTransactionObj = {};
        search.create({
            type: 'customrecord_ebay_transaction',
            filters: filters,
            columns: ['custrecord_ebay_transaction_id']
        }).run().each(function(result) {
            searchTransactionObj[result.getValue('custrecord_ebay_transaction_id')] = result.id;
            return true;
        });
        return searchTransactionObj;
    }

    //搜索未解析文件列表
    const getParseFileList = () => {
        let allFile = [];
        search.create({
            type: 'customrecord_file_analysis_list',
            filters:
                [
                    ['custrecord_sales_platform', 'is', ebayPlatform], 'AND',
                    ['custrecord_data_type', 'is', transactionType], 'AND',
                    ['custrecordanalysis_status', 'is', false]
                ],
        }).run().each(function(result) {
            allFile[allFile.length] = result;
            if(allFile.length < 10) {
                return true;
            }
        });
        log.debug('allFile', allFile);
        return allFile;
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});
