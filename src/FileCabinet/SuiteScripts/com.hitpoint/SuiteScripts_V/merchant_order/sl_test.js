

/**
 *@NApiVersion 2.1
 *@NScriptType Suitelet
 */
 define(['N/record','N/file','N/format'], function (record,file,format) {

	function onRequest(context) {
		let request = context.request;
		let response = context.response;
		
		log.debug('response1', new Date());
        log.debug('response1', new Date(1644465448000));
		log.debug('response1', );
        log.debug('response1', format.format({value:new Date(1644465448000), type: format.Type.DATETIME,timezone: format.Timezone.ASIA_HONG_KONG}));
		
		
	}

	

	return {
		onRequest: onRequest
	}
});
