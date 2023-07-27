/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', 'N/search', 'N/file'],
(record, search, file) => {

    const ebayPlatform = 5;
    const returnType = 3;

    const enumType = {
        order: {
            type: 'customrecord_ebay_order',
            field: 'custrecord_ebay_order_id'
        },
        return: {
            type: 'customrecord_ebay_return',
            field: 'custrecord_ebay_return_id'
        }
    };

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

            let members = JSON.parse(fileText).members;

            let returnIds = [];
            let orderIds = [];
            //customrecord_ebay_return
            for(let key in members) {
                let member = members[key];
                let returnId = member['returnId'];
                let orderId = member['orderId'];
                returnIds[key] = returnId;
                orderIds[key] = orderId;
            }
            let searchReturObj = searchObj(returnIds, enumType.order.type, enumType.order.field);
            let searchOrderObj = searchObj(orderIds, enumType.return.type, enumType.return.field);
            let returnObjs = [];
            for(let key in members) {
                returnObjs[key] = parseReturn(members[key], value);
            }
            context.write({
                key: value.id,
                value: {
                    searchReturObj: searchReturObj,
                    returnList: returnObjs,
                    searchOrderObj: searchOrderObj
                }
            });
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const reduce = (context) => {
        try{
            let val = JSON.parse(context.values[0]);
            let returnList = val.returnList;
            let searchReturObj = val.searchReturObj;
            let searchOrderObj = val.searchOrderObj;
            for(let key in returnList) {
                let recId = createReturn(returnList[key], searchReturObj, searchOrderObj);
                log.debug('Ebay: 退货数据{}内部标识', recId);
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

    const createReturn = (returnObj, searchReturObj, searchOrderObj) => {
        let rec = searchReturObj[returnObj.custrecord_ebay_return_id]?record.load(enumType.return.type, searchReturObj[returnObj.custrecord_ebay_return_id]):record.create(enumType.return.type);
        for(let key in returnObj) {
            rec.setValue(key, returnObj[key]);
        }
        let orderId = searchOrderObj[returnObj.custrecord_ebay_ra_orderid];
        if(orderId) {
            rec.setValue('custrecord_ebay_ra_order', orderId);
        }
        rec.setValue('name', returnObj.custrecord_ebay_return_id);
        return rec.save();
    }

    const parseReturn = (returnData, value) => {
        let returnObj = {};
        returnObj.custrecord_ebay_return_id = returnData.returnId;
        returnObj.custrecord_ebay_ra_orderid = returnData.orderId;
        returnObj.custrecord_ebay_ra_buyerloginname = returnData.buyerLoginName;
        returnObj.custrecord_ebay_ra_sellerloginname = returnData.sellerLoginName;
        returnObj.custrecord_ebay_ra_currenttype = returnData.currentType;
        returnObj.custrecord_ebay_ra_state = returnData.state;
        returnObj.custrecord_ebay_ra_status = returnData.status;
        returnObj.custrecord_ebay_ra_issellerprotected = returnData.isSellerProtected;
        returnObj.custrecord_ebay_ra_creationinfo = JSON.stringify(returnData.creationInfo);
        returnObj.custrecord_ebay_ra_sellertotalrefund = JSON.stringify(returnData.sellerTotalRefund);
        returnObj.custrecord_ebay_ra_buyertotalrefund = JSON.stringify(returnData.buyerTotalRefund);
        returnObj.custrecord_ebay_ra_sellerresponsedue = JSON.stringify(returnData.sellerResponseDue);
        returnObj.custrecord_ebay_ra_buyerresponsedue = JSON.stringify(returnData.buyerResponseDue);
        returnObj.custrecord_ebay_ra_escalationinfo = JSON.stringify(returnData.escalationInfo);
        returnObj.custrecord_ebay_ra_selleravailableoption = JSON.stringify(returnData.sellerAvailableOptions);
        returnObj.custrecord_ebay_ra_buyeravailableoptions = JSON.stringify(returnData.buyerAvailableOptions);
        returnObj.custrecord_ebay_ra_returnpolicy = JSON.stringify(returnData.returnPolicy);
        returnObj.custrecord_ebay_ra_flags = JSON.stringify(returnData.flags);

        if(returnData.timeoutDate) {
            returnObj.custrecord_ebay_ra_timeoutdate = returnData.timeoutDate.value;
        }

        returnObj.custrecord_ebay_ra_parse_file = value.id;
        returnObj.custrecord_ebay_ra_ns_status = 'PLATFORM_ORDER';
        let store = search.lookupFields({
            type: 'customrecord_file_analysis_list',
            id: value.id,
            columns: ['custrecord_seller_dev_1']
        });
        returnObj.custrecord_ebay_ra_store = store.custrecord_seller_dev_1[0].value;
        return returnObj;
    }

    const searchObj = (orderIds, recordType, column) => {
        let filters = [];
        for(let i in orderIds) {
            if(i == 0) {
                filters[filters.length] = [column, 'is', orderIds[i]];
            }else{
                filters[filters.length] = 'OR';
                filters[filters.length] = [column, 'is', orderIds[i]];
            }
        }
        let resultObj = {};
        search.create(recordType, filters, [column]).run().each(function(result) {
            resultObj[result.getValue(column)] = result.id;
            return true;
        });
        return resultObj;
    }

    //搜索未解析文件列表
    const getParseFileList = () => {
        let allFile = [];
        search.create({
            type: 'customrecord_file_analysis_list',
            filters:
                [
                    ['custrecord_sales_platform', 'is', ebayPlatform],'AND',
                    ['custrecord_data_type', 'is', returnType],'AND',
                    ['custrecordanalysis_status', 'is', false]
                ],
            columns: []
        }).run().each(function(result) {
            allFile[allFile.length] = result;
            if(allFile.length < 10) {return true;}
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
