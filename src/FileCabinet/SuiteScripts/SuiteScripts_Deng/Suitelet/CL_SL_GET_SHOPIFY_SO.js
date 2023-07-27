/**
 *@NApiVersion 2.1
 *@NScriptType Suitelet
 */
define(['N/record', 'N/search'], 
function(record, search) {

    function onRequest(context) {
        var orderList = [];
        try{
            var body = JSON.parse(context.request.body);
            log.debug('body', body);
            var mySearch = search.create({
                type: 'customrecord_hc_shopify_order',
                filters:
                [
                    ["custrecord_hc_spf_order_financial_paidat", "startswith", body.paid_at]
                ],
                columns:[]
            });
            mySearch.run().each(function(result){
                var rec = record.load({
                    type: 'customrecord_hc_shopify_order',
                    id: result.id
                });
                var paid_at = rec.getValue('custrecord_hc_spf_order_financial_paidat');
                paid_at = paid_at.slice(0, 10);
                orderList.push({
                    paid_at_date: paid_at,
                    paid_at: rec.getValue('custrecord_hc_spf_order_financial_paidat'),
                    name: rec.getValue('custrecord_hc_spf_order_name'),
                    email: rec.getValue('custrecord_hc_spf_order_email'),
                    create_date: rec.getValue('custrecord_hc_spf_order_created_at'),
                    shipping_name: rec.getValue('custrecord_hc_spf_order_shipping_name'),
                    shipping_street: rec.getValue('custrecord_hc_spf_order_shipping_street'),
                    shipping_address1: rec.getValue('custrecord_hc_spf_order_shippingaddress1'),
                    shipping_address2: rec.getValue('custrecord_hc_spf_order_shippingaddress2'),
                    shipping_company: rec.getValue('custrecord_hc_spf_order_shipping_company'),
                    shipping_city: rec.getValue('custrecord_hc_spf_order_shipping_city'),
                    shipping_zip: rec.getValue('custrecord_hc_spf_order_shipping_zip'),
                    shipping_province: rec.getValue('custrecord_hc_spf_order_shippingprovince'),
                    shipping_country: rec.getValue('custrecord_hc_spf_order_shipping_country'),
                    shipping_phone: rec.getValue('custrecord_hc_spf_order_shipping_phone'),

                    line_item: []
                });
                var itemCount = rec.getLineCount('recmachcustrecord_hc_spf_oi_item_parent');
                for(var i = 0; i < itemCount; i++){
                    orderList[orderList.length - 1].line_item.push({
                        quantity: rec.getSublistValue('recmachcustrecord_hc_spf_oi_item_parent', 'custrecord_hc_spf_oi_item_qty', i),
                        sku: rec.getSublistValue('recmachcustrecord_hc_spf_oi_item_parent', 'custrecord_hc_spf_oi_item_sku', i),
                    });
                }
                return true;
            });
        }catch(e){
            log.debug('error', e.message + ';' + e.stack);
        }
        context.response.write(JSON.stringify(orderList));
    }

    return {
        onRequest: onRequest
    }
});
