/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope Public
 */
// ccy/merchant_order_sc.js123
define(['N/record', 'N/search', 'N/task', './ccy'],

function(record, search, task, ccy) {
   
    /**
     * Definition of the Scheduled script trigger point.
     *
     * @param {Object} scriptContext
     * @param {string} scriptContext.type - The context in which the script is executed. It is one of the values from the scriptContext.InvocationType enum.
     * @Since 2015.2
     */
    function execute(scriptContext) {
		let specific_order_strategy = ccy.get_script_param('custscript_mos_specific_order_strategy');
		let order_router = get_order_router();
		let order_strategy = get_order_strategy(order_router, specific_order_strategy);
		log.debug('order_strategy', order_strategy);
		order_strategy.filter(os => os.running == false).map(os => start_order_transfer(os.id));
    }

	function start_order_transfer(osid){
		record.submitFields({type: 'customrecord_hc_merchant_order_strategy', id: osid, 
			values: {"custrecord_hc_mos_script_running": true}})

		let otask = task.create({taskType: task.TaskType.MAP_REDUCE});
		let params = {};
		params.custscript_mom_order_router = osid;
		otask.scriptId = 'customscript_merchant_order_mr';
		otask.params = params;
		otask.submit();
	}

	function get_order_strategy(order_router, specific_order_strategy){
		let fils = [];
		fils.push(['custrecord_hc_mos_enable','is', 'T']);
		fils.push('and');
		fils.push(['isinactive', 'is', 'F']);
		if(specific_order_strategy&&specific_order_strategy > 0){
			fils.push('and');
			fils.push(['internalid','anyof', specific_order_strategy]);
		}
		let cols = [];
		cols[0] = 'custrecord_hc_mos_script_running';
		cols[1] = 'name';

		let osearch = search.create({type: 'customrecord_hc_merchant_order_strategy', 
			filters: fils, columns: cols});

		let order_strategy = [];
		osearch.run().each(function (res){
			log.debug('res',res);
			let os = {};
			os.id = res.id;
			os.name = res.getValue(cols[1]);
			os.running = res.getValue(cols[0]);

			order_strategy.push(os);
			return true;
		});
		

		return order_strategy;
	}

	function get_order_router(){
		let fils = [];
		fils.push({name: 'isinactive', operator: 'is', values: false});
		let orsearch = search.create({type: 'customrecord_hc_merchant_order_router', filters: fils});
		let res = orsearch.run().getRange({start: 0, end: 10});
		if(res.length == 0) throw '无订单路由';
		if(res.length > 1) throw '有效订单路由只能有一个';

		return res[0].id;
	}



    return {
        execute: execute
    };
    
});
