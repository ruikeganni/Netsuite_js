/**
 * ebay创建商家订单
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', 'N/search', './util/PLATFORM_UTIL_METHOD', 'N/runtime'], 
(record, search, methodUtil, runtime) => {

    const getInputData = () => {
        try{
            return getEbayPlatformOrderList();
        }catch(e) {
            log.debug('error', e.message + ';'+e.stack);
        }
    }

    const map = (context) => {
        try{
            let order = JSON.parse(context.value);
            search.create({
                type: 'customrecord_ebay_order_item',
                filters: [['custrecord_ebay_item_order', 'is', order.id]],
                columns: ['custrecord_ebay_item_order', 'custrecord_ebay_item_sku', 
                        'custrecord_ebay_item_lineitemid', 'custrecord_ebay_item_legacyitemid', 
                        'custrecord_ebay_total', 'custrecord_ebay_item_quantity', 'custrecord_ebay_item_title',
                        'custrecord_ebay_item_total_currency']
            }).run().each(function(itemResult) {
                order.itemList[order.itemList.length] = {
                    id: itemResult.id,
                    custrecord_hc_mol_commerce_sku: itemResult.getValue('custrecord_ebay_item_sku'),
                    lineitemid: itemResult.getValue('custrecord_ebay_item_lineitemid'),
                    custrecord_hc_mol_line_item_id: itemResult.getValue('custrecord_ebay_item_lineitemid'),
                    custrecord_hc_mol_unit_price: Number(Number(itemResult.getValue('custrecord_ebay_total'))/Number(itemResult.getValue('custrecord_ebay_item_quantity'))).toFixed(2),
                    custrecord_hc_mol_quantity: itemResult.getValue('custrecord_ebay_item_quantity'),
                    custrecord_hc_mol_sku_description: itemResult.getValue('custrecord_ebay_item_title'),
                    custrecord_hc_mol_currency: itemResult.getValue('custrecord_ebay_item_total_currency')
                };
                return true;
            });
            let rec = record.load({
                type: 'customrecord_ebay_order',
                id: order.id
            });
            order = ebayToObj(rec, order);
            log.debug('order', order);

            context.write({
                key: rec.id,
                value: order
            });
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    const reduce = (context) => {
        try{
            let order = JSON.parse(context.values[0]);
            let responseObj = methodUtil.createSO(order);
            if(responseObj){
                record.submitFields({
                    type:'customrecord_ebay_order',
                    id: order.id,
                    values:{
                        'custrecord_ebay_ns_status': responseObj.msg,
                        'custrecord_ebay_merchant_order': responseObj.recId
                    }
                });
            }
        }catch(e) {
            log.debug('error',e.message+';'+e.stack);
        }
    }

    const summarize = (summary) => {
        log.debug('', 'end');
    }

    const ebayToObj = function(rec, order){
        order.custrecord_hc_mo_order_id = rec.getValue('custrecord_ebay_order_id'); //订单编号
        order.custrecord_hc_mo_custom_order_id = rec.getValue('custrecord_ebay_order_id'); //自定义平台订单号
        order.custrecord_hc_mo_currency = rec.getValue('custrecord_ebay_paymentsummary_tds_curre'); //货币
        order.custrecord_creation_date = rec.getValue('custrecord_ebay_creation_date');
        
        let store = search.lookupFields({
			type: 'customrecord_hc_seller_profile',
			id: rec.getValue('custrecord_ebay_store'),
			columns: ['custrecord_hc_sp_department', 'custrecord_hc_sp_default_order_location', 'custrecord_hc_sp_sales_channel', 'custrecord_hc_sp_customer', 'custrecord_hc_sp_owned_subsidiary']
		});
        order.custrecord_hc_mo_ecommerce_platform = store.custrecord_hc_sp_sales_channel.length > 0?store.custrecord_hc_sp_sales_channel[0].value:''; //销售平台
        order.custrecord_hc_mo_fulfillment_channel = '2';  //销售渠道
        order.custrecord_hc_mo_location = store.custrecord_hc_sp_default_order_location.length > 0 ?store.custrecord_hc_sp_default_order_location[0].value:''; //仓库
        order.custrecord_hc_mo_department = store.custrecord_hc_sp_department.length > 0?store.custrecord_hc_sp_department[0].value:''; //部门
        order.custrecord_hc_mo_subsidiary = store.custrecord_hc_sp_owned_subsidiary.length > 0?store.custrecord_hc_sp_owned_subsidiary[0].value:''; //附属公司
        order.custrecord_hc_mo_seller_profile = rec.getValue('custrecord_ebay_store');
        order.custrecord_hc_mo_customer = store.custrecord_hc_sp_customer.length > 0?store.custrecord_hc_sp_customer[0].value:''; //客户（店铺）

        let addArray = JSON.parse(rec.getValue('custrecord_ebay_fulfillmentstartinstruct'));
        if(addArray.length > 0){
            let addObj = addArray[0].shippingStep;
            order.custrecord_hc_mo_recipient_name = addObj.shipTo.fullName; //收货人名称
            order.custrecord_hc_mo_recipient_phone = addObj.shipTo.primaryPhone?addObj.shipTo.primaryPhone.phoneNumber:''; //收货人电话
            order.custrecord_hc_mo_county = addObj.shipTo.contactAddress.countryCode; //国家
            order.custrecord_hc_mo_country_code = addObj.shipTo.contactAddress.countryCode; //国家二字码
            order.custrecord_hc_mo_city = addObj.shipTo.contactAddress.city; //城市
            order.custrecord_hc_mo_state = addObj.shipTo.contactAddress.stateOrProvince; //state
            order.custrecord_hc_mo_addressline1 = addObj.shipTo.contactAddress.addressLine1; //地址1
            order.custrecord_hc_mo_postal_code = addObj.shipTo.contactAddress.postalCode; //邮编号码
            order.custrecord_hc_mo_addressline2 = addObj.shipTo.contactAddress.addressLine2; //地址2
            order.custrecord_hc_mo_email = addObj.shipTo.email; //买家邮箱
            order.custrecord_hc_mo_buyerspecifiedlogistics = addObj.shippingServiceCode; //买家指定物流
            order.custrecord_hc_mo_company_name = addObj.shipTo.companyName; //公司名称
        }
        return order;
    }

    const getEbayPlatformOrderList = () => {
        let orderList = {};
        let searchId = runtime.getCurrentScript().getParameter('custscript5');
        search.load(searchId).run().each(function(result) {
            orderList[result.id] = {
                id: result.id,
                orderId: result.getValue('custrecord_ebay_order_id'),
                itemList: []
            };
            return true;
        });
        log.debug('orderList', orderList);
        return orderList;
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});