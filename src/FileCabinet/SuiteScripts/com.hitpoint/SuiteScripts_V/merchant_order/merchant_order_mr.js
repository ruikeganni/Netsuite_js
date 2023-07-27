/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope Public
 */
//ccy/merchant_order_mr.js
define(['N/search', 'N/record', 'N/runtime', './ramda.min.js', './mo_functions', './ccy'],

function(search, record, runtime, R, mo_functions, ccy) {
   
    /**
     * Marks the beginning of the Map/Reduce process and generates input data.
     *
     * @typedef {Object} ObjectRef
     * @property {number} id - Internal ID of the record instance
     * @property {string} type - Record type id
     *
     * @return {Array|Object|Search|RecordRef} inputSummary
     * @since 2015.1
     */
    function getInputData() {
		try {
			let osinfo = get_osinfo();
			log.debug('order strategy info', osinfo);
			
			let search_results = get_search_results(osinfo.search_id);
			let key_indexes = osinfo.line.filter(ln => !ln.child_record && ln.is_key).map(R.prop('column_index'));
			search_results.map(sr => sr.key = key_indexes.map(ki => sr[ki]).join(':'));
			log.debug(' R.groupBy', R.groupBy(R.prop('key'))(search_results))
			return R.groupBy(R.prop('key'))(search_results);
		} catch (error) {
			log.debug('error',error);
		}
		
    }

	let order_strategy_info = null;
	function get_osinfo(){
		if(!order_strategy_info){
			let order_strategy = ccy.get_script_param('custscript_mom_order_strategy');
			log.debug('order_strategy', order_strategy);
			order_strategy_info = get_order_strategy_info(order_strategy);
		}

		return order_strategy_info;
	}

	function get_search_results(search_id){
		let res = [];

		let source_search = search.load({id: search_id});
		let cols = source_search.columns;
		let pd = source_search.runPaged({pageSize: 1000});
		log.debug('all count', pd.count);
		if(pd.count > 0){
			let page = pd.fetch({index: 0});
			res = get_page_results(page, cols);
			while(page.isLast != true){
				page = page.next();
				res = res.concat(get_page_results(page, cols));
			}
		}

		return res;
	}

	function get_page_results(page, cols){
		return page.data.map(function (dd){
			let rr = {};
			rr.id = dd.id;
			cols.map(function (col, index){
				rr[index] = dd.getValue(col);
			});

			return rr;
		});
	}

	function get_order_strategy_info(order_strategy){
		let fils = [];
		fils.push({name: 'custrecord_hc_momp_strategy', operator: 'anyof', values: order_strategy});
		let cols = [];
		cols[0] = 'custrecord_hc_momp_child_record';
		cols[1] = 'custrecord_hc_momp_record_field_id';
		cols[2] = 'custrecord_hc_momp_key_field';
		cols[3] = 'custrecord_hc_momp_header';
		cols[4] = 'custrecord_hc_momp_search_field_index';
		cols[5] = 'custrecord_hc_momp_value';
		cols[6] = 'custrecord_hc_momp_function.custrecord_hc_mofm_script';
		cols[7] = 'custrecord_hc_momp_strategy.name';
		cols[8] = 'custrecord_hc_momp_strategy.custrecord_hc_mos_data_source';
		cols[9] = 'custrecord_hc_momp_strategy.custrecord_hc_mos_transfer_to_record_id';
		cols[10] = 'custrecord_hc_momp_strategy.custrecord_hc_mos_form_setup';
		cols[11] = 'custrecord_hc_momp_strategy.custrecord_hc_mos_order_write_back';
		cols[12] = 'custrecord_hc_momp_strategy.custrecord_hc_mos_result_store_in';
		cols[13] = 'custrecord_hc_momp_strategy.custrecord_hc_mos_source_from_record';
		cols[14] = 'custrecord_hc_momp_strategy.custrecord_hc_mos_seller_profile';
		cols[15] = 'custrecord_hc_momp_setvalue';
		cols[16] = 'custrecord_hc_momp_search_field_sum';
		cols[17] = 'custrecord_hc_momp_filed_sum';

		let osearch = search.create({type: 'customrecord_hc_merchant_order_mapping', filters: fils, columns: cols});
		let res = osearch.run().getRange({start: 0, end: 1000});
		let osinfo = {};
		res.map(function (rr, index){
			if(index == 0){
				osinfo.name = rr.getValue(cols[7]);
				osinfo.search_id = rr.getValue(cols[8]);
				osinfo.to_record_type = rr.getValue(cols[9]);
				osinfo.from_record_type = rr.getValue(cols[13]);
				osinfo.form = rr.getValue(cols[10]);
				osinfo.order_write_back = rr.getValue(cols[11]);
				osinfo.result_store_in = rr.getValue(cols[12]);
				osinfo.profile_index = Number(rr.getValue(cols[14])) - 1;
				osinfo.line = [];
			}
			let ln = {};
			ln.child_record = rr.getValue(cols[0]);
			ln.field_id= rr.getValue(cols[1]);
			ln.is_key = rr.getValue(cols[2]);
			ln.is_header = rr.getValue(cols[3]);
			ln.column_index = Number(rr.getValue(cols[4]))-1;
			ln.fixed_value = rr.getValue(cols[5]);
			ln.function_name = rr.getValue(cols[6]);
			ln.set_text = rr.getValue(cols[15]);
			ln.sum_fileds = rr.getValue(cols[16]);
			ln.isSum = rr.getValue(cols[17]);
			osinfo.line.push(ln);
		});

		return osinfo;
	}

    /**
     * Executes when the map entry point is triggered and applies to each key/value pair.
     *
     * @param {MapSummary} context - Data collection containing the key/value pairs to process through the map stage
     * @since 2015.1
     */
    function map(context) {
		let osinfo = get_osinfo();
		let lines = JSON.parse(context.value);
		log.debug('osinfo',osinfo);
		try{
			let key = context.key;
			let exist_id = get_id_by_externalid(osinfo.to_record_type, key);
			let rec = null;
			mo_functions.find_profile(lines[0][osinfo.profile_index]);
			if(exist_id > 0){
				rec = record.load({type: osinfo.to_record_type, id: exist_id, isDynamic: true});
			}
			else if(osinfo.form){
				rec = record.create({type: osinfo.to_record_type, isDynamic: true, 
					defaultValues: {customform: osinfo.form}});
				// rec.setValue('externalid',key);
			}
			else{
				rec = record.create({type: osinfo.to_record_type, isDynamic: true});
				// rec.setValue('externalid',key);
			}
			update_body_fields(rec, osinfo.line.filter(ln => !ln.child_record), lines[0]);
			update_sublists(rec, osinfo.line.filter(ln => ln.child_record), lines);

			let moid = rec.save();

			lines.map(function (ln){
				let vv = {};
				vv[osinfo.order_write_back] = moid;
				record.submitFields({type: osinfo.from_record_type, id: ln.id, values: vv});
			});
		}
		catch(e){
			log.error('map ', e);
			lines.map(function (ln){
				let vv = {};
				vv[osinfo.result_store_in] = e.message;
				record.submitFields({type: osinfo.from_record_type, id: ln.id, values: vv});
			});
		}
		context.write(context.key, context.value);
    }

	function update_sublists(rec, line_strategy, lines){
		let g_line_strategy = R.groupBy(R.prop('child_record'), line_strategy);
		log.debug('g_line_strategy',g_line_strategy);
		lines.map(function (line){
			R.mapObjIndexed(function (lss){
				const slid = 'recmach' + lss.find(ls => ls.is_header == true).field_id;
				let key_fields = lss.filter(ls => ls.is_header == false && ls.is_key == true).map(function (ls){
					let vv = line.fixed_value;
					if(parseInt(ls.column_index) >= 0){
						vv = line[ls.column_index];
					}
					if(ls.function_name){
						vv = mo_functions[ls.function_name](vv);
					}
					return {field: ls.field_id, value: vv};
				});
				let linenum = find_line_number(rec, slid, key_fields);
				if(linenum >= 0){
					rec.selectLine({sublistId: slid, line: linenum});
				}
				else{
					rec.selectNewLine({sublistId: slid});
				}
				lss.filter(ls => ls.is_header == false).map(function (ls){
					let vv = line.fixed_value;
					if(parseInt(ls.column_index) >= 0){
						vv = line[ls.column_index];
					}
					if(ls.function_name){
						vv = mo_functions[ls.function_name](vv);
					}
					if(ls.set_text == true){
						rec.setCurrentSublistText({sublistId: slid, fieldId: ls.field_id, text: vv});
					}
					else{
						rec.setCurrentSublistValue({sublistId: slid, fieldId: ls.field_id, value: vv});
					}
				});
				rec.commitLine({sublistId: slid});
			})(g_line_strategy);
		});

		return rec;
	}

	function find_line_number(rec, slid, key_fields){
		let linecount = rec.getLineCount({sublistId: slid});
		for(let i = 0; i < linecount; i++){
			let res = key_fields.map(function (kf){
				let vv = rec.getSublistValue({sublistId: slid, fieldId: kf.field, line: i});
				if(vv == kf.value) return true;

				return false;
			});

			if(res.length > 0 && res.every(r => r)) {
				return i;
			}
		}

		return -1;
	}

	function update_body_fields(rec, line_strategy, body){
		log.debug('line_strategy',line_strategy);
		line_strategy.map(function (ls){
			log.debug('ls.field_id',ls.field_id);
			let vv = ls.fixed_value;
			if(parseInt(ls.column_index) >= 0){
				vv = body[ls.column_index];
			}
			if (ls.isSum && ls.sum_fileds) {
				let sumFileds = ls.sum_fileds.split(',');
				sumFileds.forEach(r=> vv = Number(vv)+Number(body[Number(r)-1]));
				log.debug('vv',vv);
				log.debug('ls.field_id',ls.field_id);
			}
			if(ls.function_name){
				vv = mo_functions[ls.function_name](vv);
			}
			if(ls.set_text == true){
				if (vv) {
					rec.setText({fieldId: ls.field_id, text: vv});
				}
			}
			else{
				if(vv){
					rec.setValue({fieldId: ls.field_id, value: vv});
				}
			}
		});

		return rec;
	}

	function get_id_by_externalid(type, exid){
		let fil = ['externalid', 'anyof', exid];
		let esearch = search.create({type: type, filters: fil});
		let res = esearch.run().getRange({start: 0, end: 1});
		if(res.length > 0){
			return res[0].id;
		}
	}

    /**
     * Executes when the reduce entry point is triggered and applies to each group.
     *
     * @param {ReduceSummary} context - Data collection containing the groups to process through the reduce stage
     * @since 2015.1
     */
    function reduce(context) {
		context.write(context.key, 'test_param');
    }


    /**
     * Executes when the summarize entry point is triggered and applies to the result set.
     *
     * @param {Summary} summary - Holds statistics regarding the execution of a map/reduce script
     * @since 2015.1
     */
    function summarize(summary) {
		let order_strategy = ccy.get_script_param('custscript_mom_order_strategy');
		record.submitFields({type: 'customrecord_hc_merchant_order_strategy', id: order_strategy, 
			values: {"custrecord_hc_mos_script_running": false}});
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
    
});
