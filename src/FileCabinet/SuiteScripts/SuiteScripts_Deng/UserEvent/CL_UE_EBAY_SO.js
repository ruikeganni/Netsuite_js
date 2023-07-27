/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/record', 'N/search'], 
function(record, search) {

    function beforeLoad(context) {
        
    }

    function beforeSubmit(context) {
        try{
            var rec = context.newRecord;
            var fulfillmentstartinstruct =JSON.parse(rec.getValue('custrecord_ebay_fulfillmentstartinstruct'));
            if(fulfillmentstartinstruct && fulfillmentstartinstruct.length > 0){
                var shipAdd = fulfillmentstartinstruct[0].shippingStep.shipTo;
                if(shipAdd.contactAddress){
                    rec.setValue('custrecordebay_addressline1', shipAdd.contactAddress.addressLine1);
                    rec.setValue('custrecord_ebay_postalcode', shipAdd.contactAddress.postalCode);
                    rec.setValue('custrecord_ebay_countrycode', shipAdd.contactAddress.countryCode);
                    rec.setValue('custrecord_ebay_stateorprovince', shipAdd.contactAddress.stateOrProvince);
                    rec.setValue('custrecord_ebay_addressline2', shipAdd.contactAddress.addressLine2);
                    rec.setValue('custrecord_ebay_city', shipAdd.contactAddress.city);
                }
                if(shipAdd.primaryPhone){
                    rec.setValue('custrecord_ebay_phonenumber', shipAdd.primaryPhone.phoneNumber);
                }
                rec.setValue('custrecord_ebay_email', shipAdd.email);
                rec.setValue('custrecord_ebay_fullname', shipAdd.fullName);
            }
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
