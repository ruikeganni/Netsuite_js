/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
// mo_functions.js
define(['N/search','N/format','./moment.min.js'],

function(search,format,moment) {

	let profiles = null;
	let cur_profile = null;

	function find_profile(weconnect_id){
		if(!profiles){
			profiles = search_profiles();
		}

		let fp = profiles.find(p => p.weconnect_id == weconnect_id);
		if(fp){
			cur_profile = fp;
			return ;
		}
		else{
			throw 'can not find profile with weconnect id:' + weconnect_id;
		}
	}

	function get_profile_params(name){
		return function (weconnect_id){
			return cur_profile[name];
		}
	}

	function search_profiles(){
		let fil = ['isinactive', 'is', false];
		let cols = [];
		cols[0] = 'custrecord_hc_sp_owned_subsidiary';
		cols[1] = 'custrecord_hc_sp_default_order_location';
		cols[2] = 'custrecord_hc_sp_department';
		cols[3] = 'custrecord_hc_sp_customer';
		cols[4] = 'custrecord_hc_sp_weconnect_id';

		let psearch = search.create({type: 'customrecord_hc_seller_profile', filters: fil, columns: cols});
		let prs = [];
		let count = 0;
		psearch.run().each(function (res){
			let pr = {};
			pr.id = res.id;
			pr.subsidiary = res.getValue(cols[0]);
			pr.location = res.getValue(cols[1]);
			pr.department = res.getValue(cols[2]);
			pr.customer = res.getValue(cols[3]);
			pr.weconnect_id = res.getValue(cols[4]);
			prs.push(pr);

			return ++count < 4000;
		});

		return prs;
	}

	function parse_date(dstr){
		log.debug('dstr',dstr);
		if (dstr) {
			return format.format({value:new Date(Number(dstr)), type: format.Type.DATE,timezone: format.Timezone.ASIA_HONG_KONG})	
		}else{
			return '';
		}
		
	}

	function parse_time(tstr){
		log.debug('tstr',tstr);
		if (tstr) {
			return format.format({value:new Date(Number(tstr)), type: format.Type.DATETIME,timezone: format.Timezone.ASIA_HONG_KONG})
		}else{
			return '';
		}
	}

	function to_number(n){
		return Number(n.replace(/,/g, ''));
	}

	function settle_type_mapping(name) {
		let fil = [['isinactive', 'is', false],'and',['name', 'is', name]];
		let cols = [];
		cols[0] = 'custrecord_hc_stm_type';
		let psearch = search.create({type: 'customrecord_hc_settle_type_mapping', filters: fil, columns: cols});
		let prs = '';
		psearch.run().each(function (res){
			prs = res.getValue(cols[0]);
			return true;
		});
		return prs;
	}

	//2022-02-21T01:04:10+08:00 转YYYY/MM/DD
	function shopify_parse_date(date) {
		return date?date.split('T')[0].replace(/-/g,"/"):''
	}
	//MM/DD/YYYY转 YYYY/MM/DD
	function walmart_parse_date(date) {
		if (date) {
			let arr = date.split('/');
			let newdate = arr[2]+'/'+arr[0]+'/'+arr[1];
			return newdate;
		}
		return '';
	}
	function reSetmoney(s) {   
		log.debug('s',s);
		return s&&s!='undefined'&&s!=null&&(s+'').trim()&&s!=0?parseFloat((s+'').replace(/[^\d\.-]/g, "")):0;   
	 } 
	 function format_sys_ymd(data) {
		if (data) {
			return moment(data).format('YYYY/MM/DD');
		}
		return '';
	 }
    return {
		profile_customer: get_profile_params('customer'),
		profile_subsidiary: get_profile_params('subsidiary'),
		profile_department: get_profile_params('department'),
		profile_location: get_profile_params('location'),
		parse_date: parse_date,
		parse_time: parse_time,
		find_profile: find_profile,
		to_number: to_number,
		settle_type_mapping:settle_type_mapping,
		shopify_parse_date:shopify_parse_date,
		walmart_parse_date:walmart_parse_date,
		reSetmoney:reSetmoney,
		format_sys_ymd:format_sys_ymd
    };
    
});
