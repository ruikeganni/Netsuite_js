/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/file', 'N/search', 'N/record', './moment'], 
function(file, search, record, moment) {

    const ebayPlatform = 5;

    /**
     * 创建文件,创建文件解析列表记录
     * @param value 店铺信息
     * @param response 接口返回信息
     */
    const createFile = (name, value, response, folder, platform, type) => {
        let date = new Date();
        let fileName = name+''+value.name+'_'+date.getFullYear()+date.getMonth()+date.getDay()+date.getTime();
        log.debug('fileName', fileName);
        let fileId = file.create({
            name: fileName+'.txt',
            fileType: file.Type.PLAINTEXT,
            contents: response.body,
            folder: folder
        }).save();
        log.debug('fileId', fileId);

        //创建"文件解析列表"记录
        let rec = record.create({
            type: 'customrecord_file_analysis_list',
        });
        rec.setValue('name',fileName+'.txt');  //文件名称
        rec.setValue('custrecord_file_url',fileId);  //文件路径
        rec.setValue('custrecord_sales_platform', platform);  //平台渠道
        rec.setValue('custrecord_seller_dev_1', value.id);  //店铺账号
        rec.setValue('custrecord_data_type',type);
        return rec.save();
    }

    /**
     * Ebay店铺账号
     * @returns 
     */
    const getStoreList = () => {
        let allStore = [];
        search.create({
            type: 'customrecord_hc_seller_profile',
            filters:
                [
                    ['custrecord_hc_sp_sales_channel', 'is', ebayPlatform],'AND',
                    ['custrecord_client_id', 'isnotempty', ''],'AND',
                    ['custrecord_client_secret', 'isnotempty', ''],'AND',
                    ['custrecord_refresh_token', 'isnotempty', '']
                ],
            columns: ['name',
            'custrecord_client_id',
            'custrecord_client_secret',
            'custrecord_access_token',
            'custrecord_refresh_token']
        }).run().each(function(result) {
            allStore[allStore.length] = {
                id: result.id,
                name: result.getValue('name'),
                clientId: result.getValue('custrecord_client_id'),
                clientSecret: result.getValue('custrecord_client_secret'),
                token: result.getValue('custrecord_access_token'),
                refreshToken: result.getValue('custrecord_refresh_token')
            };
            return true;
        });
        log.debug('allStore',allStore.length);
        return allStore;
    }

    /**
     * url update startTime, endTime, pageSize, pageNumber
     * @param {*} url 访问地址
     * @param {*} requestParamRec 接口请求参数
     * @returns 
     */
    const setUrl = (url, requestParamRec) => {
        let startTime = requestParamRec.getValue('custrecord_request_start_time');
        let endTime = requestParamRec.getValue('custrecord_request_end_time');
        startTime = moment(startTime).utc().format('YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
        endTime = moment(endTime).utc().format('YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
        log.debug('startTime', startTime);
        log.debug('endTime', endTime);
        url = url.replace('${startTime}', startTime);
        url = url.replace('${endTime}', endTime);
        url = url.replace('${pageSize}', requestParamRec.getValue('custrecord_request_page_size'));
        url = url.replace('${pageNumber}', requestParamRec.getValue('custrecord_request_page_number'));
        return url;
    }

    /**
     * 创建商家订单
     * @param {*} order 
     */
    const createSO = (order) => {
        let obj = {};
        search.create({
            type: 'customrecord_hc_merchant_order',
            filters: [
                ['custrecord_hc_mo_order_id', 'is', order.custrecord_hc_mo_order_id]
            ],
            columns:[]
        }).run().each(function(result) {
            order.internalid = result.id;
        });
        let rec;
        if(order.internalid) {
            log.debug('load', order.custrecord_hc_mo_order_id);
            rec = record.load({
                type: 'customrecord_hc_merchant_order',
                id: order.internalid
            });
            //订单不是待处理、未发货状态不在更新
            if(rec.getValue('custrecord_hc_mo_order_status') != 1 || rec.getValue('custrecord_hc_mo_fulfill_status') != 1){
                obj.recId = order.internalid;
                obj.msg = 'SO_FULFILLMENT';
                return obj;
            }
        }else{
            log.debug('create', order.custrecord_hc_mo_order_id);
            rec = record.create({
                type: 'customrecord_hc_merchant_order'
            });
        }
        for(var key in order){
            if(key == 'custrecord_hc_mo_currency'){
                rec.setText(key, order[key]);
            }
            else if(key == 'internalid' || key == 'id' || key == 'orderId'){}else if(key == 'custrecord_creation_date'){
                let dateTime = moment(order[key]).toDate();
                let timestamp = dateTime.getTime();
                timestamp = timestamp/1000;
                // 增加8个小时
                timestamp = timestamp+8*60*60;
                let dateTimeUtc8 = new Date(timestamp * 1000);
                log.debug('dateTime', dateTime);
                log.debug('dateTimeUtc8', dateTimeUtc8);
                
                rec.setValue('custrecord_hc_mo_purchase_date', dateTime);
                rec.setValue('custrecord_hc_mo_local_purchase_date', dateTimeUtc8);
                rec.setValue('custrecord_hc_mo_purchase_time', dateTime);
                rec.setValue('custrecord_hc_mo_local_purchase_time', dateTimeUtc8);
            }else if(key == 'itemList') {
                for(var i = 0 ; i < order[key].length; i++){
                    let item = order[key][i];
                    for(let itemKey in item){
                        if(itemKey == 'custrecord_hc_mol_currency') {
                            rec.setSublistText({
                                sublistId: 'recmachcustrecord_hc_mol_merchant_order',
                                fieldId: itemKey,
                                value: item[itemKey],
                                line: i
                            });
                        }else if(itemKey == 'id') {}else {
                            rec.setSublistValue({
                                sublistId: 'recmachcustrecord_hc_mol_merchant_order',
                                fieldId: itemKey,
                                value: item[itemKey],
                                line: i
                            });
                        }
                    }
                }
            }else {
                rec.setValue(key, order[key]);
            }
        }
        var recId = rec.save({
            ignoreMandatoryFields: true
        });
        log.debug('recId', recId);
        obj.recId = recId;
        obj.msg = 'CREATE_NS_SO';
        return obj;
    }
    
    return {
        createFile: createFile,
        getStoreList: getStoreList,
        setUrl: setUrl,
        createSO: createSO
    }
    
});
 