/**
 * CD创建商家订单
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * dzx  1
*/
define(['N/record', 'N/search', 'N/runtime', './util/PLATFORM_UTIL_METHOD'], 
(record, search, runtime, methodUtil) => {

    const getInputData =() => {
        let cdOrderListSearchId = runtime.getCurrentScript().getParameter('custscript3');

        let orderList = {};
        search.load(cdOrderListSearchId).run().each(function(result) {
            orderList[result.id] = {
                id: result.id,
                orderId: result.getValue('custrecord_cd_ordernumber'),
                itemList: []
            };
            if(orderList.length < 100){return true}
        });
        log.debug('orderList', orderList);
        return orderList;
    }

    const map = (context) => {
        try{
            let order = JSON.parse(context.value);
            search.create({
                type: 'customrecord_cd_order_item',
                filters:
                    [
                        ['custrecord_cd_order_record', 'is', order.id]
                    ],
                columns: [
                    'custrecord_cd_item_quantity',
                    'custrecord_cd_item_productcondition',
                    'custrecord_cd_item_sku',
                    'custrecord_cd_item_name',
                    'custrecord_cd_item_sellerproductid',
                    'custrecord_cd_item_acceptationstate',
                    'custrecord_item_cd_purchaseprice'
                ]
            }).run().each(function(itemResult) {
                if(itemResult.getValue('custrecord_cd_item_sellerproductid')){
                    order.itemList[order.itemList.length] = {
                        id: itemResult.id,
                        custrecord_hc_mol_commerce_sku: itemResult.getValue('custrecord_cd_item_sellerproductid'),
                        custrecord_hc_mol_line_item_id: itemResult.getValue('custrecord_cd_item_sellerproductid'),
                        custrecord_hc_mol_unit_price: itemResult.getValue('custrecord_item_cd_purchaseprice'),
                        custrecord_hc_mol_quantity: itemResult.getValue('custrecord_cd_item_quantity'),
                        custrecord_hc_mol_sku_description: itemResult.getValue('custrecord_cd_item_name'),
                        custrecord_hc_mol_currency: itemResult.getValue('custrecord_ebay_item_total_currency'),
                    };
                }
                return true;
            });
            let rec = record.load({
                type: 'customrecord_cd_order',
                id: order.id
            });
            order = CDToObj(rec, order);
            log.debug('order', order);

            context.write(rec.id, order);
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
                    type:'customrecord_cd_order',
                    id: order.id,
                    values:{
                        'custrecord_cd_so_status': responseObj.msg,
                        'custrecord_cd_merchant_order': responseObj.recId
                    }
                });
            }
        }catch(e){
            log.debug('error',e.message+';'+e.stack);
        }
    }

    const summarize = (summary) => {
        log.debug('', 'end');
    }

    const CDToObj = (rec, order) => {
        order.custrecord_hc_mo_order_id = rec.getValue('custrecord_cd_ordernumber'); //订单编号
        order.custrecord_hc_mo_currency = rec.getValue('custrecord_cd_currencycode')?rec.getValue('custrecord_cd_currencycode'):'EUR'; //货币
        order.custrecord_creation_date = rec.getValue('custrecord_cd_creationdate');
        
        let store = search.lookupFields({
            type: 'customrecord_hc_seller_profile',
            id: rec.getValue('custrecord_cd_so_store'),
            columns: ['custrecord_hc_sp_department', 'custrecord_hc_sp_default_order_location', 'custrecord_hc_sp_sales_channel', 'custrecord_hc_sp_customer', 'custrecord_hc_sp_owned_subsidiary']
        });
        order.custrecord_hc_mo_ecommerce_platform = store.custrecord_hc_sp_sales_channel.length > 0?store.custrecord_hc_sp_sales_channel[0].value:''; //销售平台
        order.custrecord_hc_mo_location = store.custrecord_hc_sp_default_order_location.length > 0 ?store.custrecord_hc_sp_default_order_location[0].value:''; //仓库
        order.custrecord_hc_mo_department = store.custrecord_hc_sp_department.length > 0?store.custrecord_hc_sp_department[0].value:''; //部门
        order.custrecord_hc_mo_subsidiary = store.custrecord_hc_sp_owned_subsidiary.length > 0?store.custrecord_hc_sp_owned_subsidiary[0].value:''; //附属公司
        order.custrecord_hc_mo_fulfillment_channel = rec.getValue('custrecord_cd_modgeslog') == 'MKPCDS'?'2':'1';  //销售渠道
        order.custrecord_hc_mo_seller_profile = rec.getValue('custrecord_cd_so_store');
        order.custrecord_hc_mo_customer = store.custrecord_hc_sp_customer.length > 0?store.custrecord_hc_sp_customer[0].value:''; //客户（店铺）

        order.custrecord_hc_mo_recipient_name = rec.getValue('custrecord_cd_shipping_lastname')+' '+rec.getValue('custrecord_cd_shipping_firstname'); //收货人名称
        let phone = rec.getValue('custrecord_cd_customer_phone')?rec.getValue('custrecord_cd_customer_phone'):rec.getValue('custrecord_cd_customer_mobilephone');
        order.custrecord_hc_mo_recipient_phone = phone; //收货人电话
        order.custrecord_hc_mo_county = rec.getValue('custrecord_cd_shipping_country'); //国家
        order.custrecord_hc_mo_country_code = rec.getValue('custrecord_cd_shipping_country'); //国家二字码
        order.custrecord_hc_mo_city = rec.getValue('custrecord_cd_shipping_city'); //城市
        order.custrecord_hc_mo_state = rec.getValue('custrecord_cd_shipping_county'); //state
        order.custrecord_hc_mo_addressline1 = rec.getValue('custrecord_cd_shipping_street'); //地址1
        order.custrecord_hc_mo_postal_code = rec.getValue('custrecord_cd_shipping_zipcode'); //邮编号码
        order.custrecord_hc_mo_addressline2 = rec.getValue('custrecord_cd_shipping_address1') + rec.getValue('custrecord_cd_shipping_address2'); //地址2
        order.custrecord_hc_mo_email = rec.getValue('custrecord_cd_customer_encryptedemail'); //买家邮箱
        order.custrecord_hc_mo_company_name = rec.getValue('custrecord_cd_shipping_companyname'); //公司名称
        return order;
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
});