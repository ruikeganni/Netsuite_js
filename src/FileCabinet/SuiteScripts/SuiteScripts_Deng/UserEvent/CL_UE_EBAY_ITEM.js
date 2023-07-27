/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define([], 
function() {

    function beforeLoad(context) {
        
    }

    function beforeSubmit(context) {
        var rec = context.newRecord;
        try{
            var discount_amount = 0;
            var appliedPromotions = JSON.parse(rec.getValue('custrecord_ebay_item_appliedpromotions'));
            for(var i = 0; i < appliedPromotions.length; i++){
                var discountAmount = appliedPromotions[i].discountAmount;
                discount_amount = discount_amount + Number(discountAmount.value);
            }
            var tax = 0;
            var taxes = JSON.parse(rec.getValue('custrecord_ebay_item_taxes'));
            for(var i = 0; i < taxes.length; i++){
                var amount = taxes[i].amount;
                tax = tax + Number(amount.value);
            }
            rec.setValue('custrecord_ebay_tax', tax);
            rec.setValue('custrecord_ebay_discount_amount', discount_amount);
            rec.setValue('custrecord_ebay_promotionid', appliedPromotions&&appliedPromotions.length>0?appliedPromotions[0].promotionId:'');
            rec.setValue('custrecord_ebay_description', appliedPromotions&&appliedPromotions.length>0?appliedPromotions[0].description:'');
        }catch(e){
            log.debug('error', e.message + ';' + e.stack);
        }
    }

    function afterSubmit(context) {
        
    }

    return {
        // beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        // afterSubmit: afterSubmit
    }
});
