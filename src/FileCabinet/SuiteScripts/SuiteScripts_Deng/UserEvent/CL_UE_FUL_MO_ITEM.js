/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
*/
define(['N/record', 'N/search'], 
(record, search) => {

    const beforeLoad = (context) => {
        
    }

    const beforeSubmit = (context) => {
        
    }

    const afterSubmit = (context) => {
        var rec = context.newRecord;
        try{
            // customrecord_hc_merchant_order_line //商家订单行
            var moItemRec = search.lookupFields({
                type: 'customrecord_hc_merchant_order_line',
                id: rec.getValue('custrecord_hc_mofi_order_line'),
                columns: ['custrecord_hc_mol_merchant_order']
            });
            //customrecord_hc_merchant_order 商家订单
            var moRec = search.lookupFields({
                type: 'customrecord_hc_merchant_order',
                id: moItemRec.custrecord_hc_mol_merchant_order[0].value,
                columns: ['custrecord_hc_mo_purchase_date', 'custrecord_hc_mo_total_amount', 'custrecord_hc_mo_item_subtotal_amount', 'custrecord_hc_mo_promotion_amount', 'custrecord_hc_mo_tax_amount', 'custrecord_hc_mo_shipping_total_amount']
            });
            var orderAmount = Number(moRec.custrecord_hc_mo_item_subtotal_amount); //订单总金额
            var orderTax = Number(moRec.custrecord_hc_mo_tax_amount); //订单总税额
            var orderShippingAmount = Number(moRec.custrecord_hc_mo_shipping_total_amount); //订单总运费
            var orderDiscount = Number(moRec.custrecord_hc_mo_promotion_amount); //订单总折扣
            if(orderDiscount > 0){
                orderAmount = orderAmount - orderDiscount;
            }

            log.debug('订单总金额', orderAmount);
            log.debug('订单总税额', orderTax);
            log.debug('订单总运费', orderShippingAmount);

            var amount = 0; //订单建议零售价相加
            var itemList = [];
            search.create({
                type: 'customrecord_hc_merchant_order_line',
                filters: [['custrecord_hc_mol_merchant_order', 'is', moItemRec.custrecord_hc_mol_merchant_order[0].value]],
                columns: []
            }).run().each(function(result) {
                search.create({
                    type: 'customrecord_hc_mo_fulfillment_items',
                    filters: [['custrecord_hc_mofi_order_line', 'is', result.id]],
                    columns: ['custrecord_hc_mofi_fulfillment_item', 'custrecord_hc_mofi_quantity']
                }).run().each(function(fulItemRet) {
                    var itemRec = search.lookupFields({
                        type: 'inventoryitem',
                        id: fulItemRet.getValue('custrecord_hc_mofi_fulfillment_item'),
                        columns: ['custitem_hc_reference_retail_price']
                    });
                    amount = (amount + Number(fulItemRet.getValue('custrecord_hc_mofi_quantity')) * Number(itemRec.custitem_hc_reference_retail_price));
                    itemList[itemList.length] = {
                        id: fulItemRet.id,
                        retail_price: itemRec.custitem_hc_reference_retail_price,
                        quantity: fulItemRet.getValue('custrecord_hc_mofi_quantity')
                    };
                    return true;
                });
                return true;
            });
            var hl = orderAmount/amount;
            log.debug('订单相加总金额', amount);
            log.debug('汇率', hl);

            var ys = 0;
            var ysTax = 0;
            var ysShip = 0;
            var ysdis = 0;
            for(var i in itemList) {
                var item = itemList[i];
                var retail_price = Number(Number(item.retail_price) * hl).toFixed(2);
                log.debug('retail_price', retail_price);
                ys = Number(ys) + Number(retail_price) * Number(item.quantity);

                var tax = (retail_price/orderAmount*orderTax*Number(item.quantity)).toFixed(2);
                ysTax = Number(ysTax) + Number(tax);
                var shippingAmount = (retail_price/orderAmount*orderShippingAmount*Number(item.quantity)).toFixed(2);
                ysShip = Number(ysShip) + Number(shippingAmount);
                var splitDiscount = (retail_price/orderAmount*orderDiscount*Number(item.quantity)).toFixed(2);
                ysdis = Number(ysdis) + Number(splitDiscount);
                record.submitFields({
                    type: 'customrecord_hc_mo_fulfillment_items', 
                    id: item.id, 
                    values: {
                        custrecord_total_tax: orderTax, //订单总税额
                        custrecord_order_shipping_amount: orderShippingAmount, //订单总运费
                        custrecord_so_amount: orderAmount, //订单总金额
                        custrecord_ful_item_tax: tax, //拆分税额
                        custrecord_split_freight: shippingAmount, //拆分运费
                        custrecord_split_unit_price: retail_price, //拆分单价
                        custrecord_split_discount: splitDiscount, //拆分折扣
                        custrecord_order_discount: orderDiscount, //订单总折扣
                        custrecord_mo_date: moRec.custrecord_hc_mo_purchase_date
                    }
                });
            }
            log.debug('ysTax', ysTax);
            ys = Number(orderAmount - ys).toFixed(2);
            ysTax = Number(orderTax - ysTax).toFixed(2);
            ysShip = Number(orderShippingAmount - ysShip).toFixed(2);
            ysdis = Number(orderDiscount - ysdis).toFixed(2);
            if(ys && ysTax && ysShip && ysdis && (ys != 0 || ysTax != 0 || ysShip != 0 || ysdis != 0)) {
                log.debug('ysTax', ysTax);
                log.debug('ysShip', ysShip);
                var itemRec = search.lookupFields({
                    type: 'customrecord_hc_mo_fulfillment_items', 
                    id: rec.id,
                    columns: ['custrecord_split_unit_price', 'custrecord_ful_item_tax', 'custrecord_split_freight', 'custrecord_hc_mofi_quantity', 'custrecord_split_discount']
                });
                var retail_price = (Number(itemRec.custrecord_split_unit_price) + Number(ys)).toFixed(2);
                var tax = (Number(itemRec.custrecord_ful_item_tax) + Number(ysTax)).toFixed(2);
                var shippingAmount = (Number(itemRec.custrecord_split_freight) + Number(ysShip)).toFixed(2);
                var splitDiscount = (Number(itemRec.custrecord_split_discount) + Number(ysdis)).toFixed(2);
                record.submitFields({
                    type: 'customrecord_hc_mo_fulfillment_items', 
                    id: rec.id, 
                    values: {
                        custrecord_split_unit_price: retail_price,
                        custrecord_ful_item_tax: tax,
                        custrecord_split_discount: splitDiscount,
                        custrecord_split_freight: shippingAmount
                    }
                });
            }
        }catch(e) {
            log.debug('error', e.message + e.stack);
        }
    }

    return {
        // beforeLoad: beforeLoad,
        // beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    }
});
