/**
 *@NApiVersion 2.1
*@NScriptType MapReduceScript
*/
define(["require", "exports", 'N/record', 'N/search', '../../common/ramda.min.js', 'N/runtime', 'N/currency'],
function (r, e, _, search, R, runtime, currency) {
    Object.defineProperty(e, "__esModule", {
        value: !0
    });
    const SEARCHFIELDID = 'custscript_cost_allocation_search';
    const SHIPPING_ORDER_RECTYPE = 'customrecord_hc_shipping_order';
    const gv = (r, f) => r.getValue(f);
    let gsv = (r, s, f, l) => r.getSublistValue({ sublistId: s, fieldId: f, line: l });
    
    //获取运单数据
    function map_get_shipping_order_datas(recid) {
        let dataObj = {};
        const ship_rec = _.load({ type: SHIPPING_ORDER_RECTYPE, id: recid });
        dataObj.sum_qty = gv(ship_rec, 'custrecord_hc_gso_total_item_quantity');
        dataObj.sum_volume = gv(ship_rec, 'custrecord_hc_gso_total_volume');
        dataObj.sum_weight = gv(ship_rec, 'custrecord_hc_gso_total_weight');
        dataObj.currency = gv(ship_rec, 'custrecord_hc_gso_destination_currency');
        dataObj.sum_value = gv(ship_rec, 'custrecord_hc_gso_total_item_value');
        dataObj.shipdate = ship_rec.getText({fieldId:'custrecord_hc_gso_ship_date'});
        dataObj.recid = recid;
        dataObj.lineArr = [];
        const subid = 'recmachcustrecord_hc_cpl_shipping_order';
        gsv = R.curry(gsv);
        let get = gsv(ship_rec, subid);
        for (let index = 0; index < ship_rec.getLineCount({ sublistId: subid }); index++) {
            let lineObj = {};
            lineObj.item = get('custrecord_hc_cpl_item', index);
            lineObj.shiped_quantity = get('custrecord_hc_cpl_item_shiped_quantity', index);
            lineObj.box_quantity = get('custrecord_hc_cpl_box_quantity', index);
            lineObj.box_volume = get('custrecord_hc_cpl_per_box_volume', index);
            lineObj.box_weight = get('custrecord_hc_cpl_per_box_weight', index);
            lineObj.total_volume = get('custrecord_hc_cpl_total_volume', index);
            lineObj.total_weight = get('custrecord_hc_cpl_total_weight', index);
            lineObj.total_value = get('custrecord_hc_cpl_total_value', index);
            lineObj.lineid = get('id', index);
            dataObj.lineArr.push(lineObj);
        }
        return dataObj;
    }
    //分摊处理
    function map_cost_allocation(shipping_data_obj, bill_data,context) {
        let landed_cost = map_search_all_landed_cost();
        let reslutObj = map_search_result(shipping_data_obj.recid);
    //  shipping_data_obj.lineArr.map(i => map_create_result(i, bill_data, shipping_data_obj, landed_cost,reslutObj));
    shipping_data_obj.lineArr.map(i => context.write({ key: 1, value: {
        item:i,
        bill_data:bill_data,
        shipping_data_obj:shipping_data_obj,
        landed_cost:landed_cost,
        reslutObj:reslutObj
    } }));
    }
    function map_search_result(recid) {
        var customrecord_hc_mo_fulfillment_orderSearchObj = search.create({
            type: "customrecord_hc_sku_costallocationresult",
            filters:
            [
            ["custrecord_hc_scar_shipping_order","anyof",recid],
            //    'and',
            //    ["custrecord_hc_scar_shipping_order_line","anyof",lineid],
            'and',
            ["isinactive","is",false]
            ],
            columns:
            [
            search.createColumn({ name: "custrecord_hc_scar_shipping_order_line"}),
            ]
        });
        let obj = {};
        customrecord_hc_mo_fulfillment_orderSearchObj.run().each(function(result){
            // .run().each has a limit of 4,000 results
            obj[result.getValue('custrecord_hc_scar_shipping_order_line')]=result.id;
            return true;
        });
        return obj;
    }
    //创建分摊结果
    function map_create_result(obj) {
    try {
        let {item, bill_data, shipping_data_obj, landed_cost,reslutObj}=obj;
        log.debug('item', item);
        log.debug('bill_data', bill_data);
        log.debug('landed_cost', landed_cost);
        let resRec = '';
        if (reslutObj[item.lineid]) {
            resRec = _.load({ type: 'customrecord_hc_sku_costallocationresult',id:reslutObj[item.lineid] });
        }else{
            resRec = _.create({ type: 'customrecord_hc_sku_costallocationresult' });
        }
        resRec.setValue('custrecord_hc_scar_item', item.item);
        resRec.setValue('custrecord_hc_scar_shipping_order', shipping_data_obj.recid);
        resRec.setValue('custrecord_hc_scar_shipping_order_line', item.lineid);
        resRec.setValue('custrecord_hc_scar_currency', shipping_data_obj.currency);
        let sumAmount = 0;
        bill_data.map(i => {
            try {
                let amount = 0;
                log.debug('shipdate',shipping_data_obj.shipdate);
                log.debug('new Date(shipping_data_obj.shipdate)',new Date(shipping_data_obj.shipdate));
                let exchangerate = currency.exchangeRate({date:new Date(shipping_data_obj.shipdate), source: i.currency, target: shipping_data_obj.currency });
                switch (Number(i.ft_type)) {
                    case 1:
                        amount = Number(item.shiped_quantity) / Number(shipping_data_obj.sum_qty) * Number(i.price) / Number(item.shiped_quantity);
                        break;
                    case 2:
                        amount = Number(item.total_volume) / Number(shipping_data_obj.sum_volume) * Number(i.price) / Number(item.shiped_quantity);
                        break;
                    case 3:
                        amount = Number(item.total_weight) / Number(shipping_data_obj.sum_weight) * Number(i.price) / Number(item.shiped_quantity);
                        break;
                    case 4:
                        let tjzl = Number(item.box_volume) / 5000;
                        if (Number(item.box_weight) > Number(tjzl)) {
                            amount = Number(item.total_weight) / Number(shipping_data_obj.sum_weight) * Number(i.price) / Number(item.shiped_quantity);
                        } else {
                            amount = Number(item.total_volume) / Number(shipping_data_obj.sum_volume) * Number(i.price) / Number(item.shiped_quantity);
                        }
                        break;
                    case 5:
                        amount = Number(item.total_value) / Number(shipping_data_obj.sum_value) * Number(i.price) / Number(item.shiped_quantity);
                        break;
                    default:
                        break;
                }
                amount = Number(amount) * exchangerate;
                // sumAmount += Number(amount);
                resRec.setValue(landed_cost[i.dacbx].field, Number(amount).toFixed(2));
                resRec.setValue('custrecord_hc_scar_exchange', exchangerate);
                _.submitFields({ type: 'customrecord_hc_global_logistics_cost', id: i.lineid, values: { custrecord_hc_glc_allocated: true } });
            } catch (error) {
                _.submitFields({ type: 'customrecord_hc_global_logistics_cost', id: i.lineid, values: { custrecord_hc_glc_allocation_err_msg: error.message } });
            }
        });
        R.map(r => sumAmount+=Number(resRec.getValue(r.field)||0))(landed_cost);
        resRec.setValue('custrecord_hc_scar_total_by_unit', Number(sumAmount).toFixed(2));
        let resultid = resRec.save();
        
    } catch (error) {
        log.error('reduceerror1',error);
    }
    

    }
    //搜索分摊字段
    function map_search_all_landed_cost() {
        let searchColumns = [
            search.createColumn({ name: 'name' }),
            search.createColumn({ name: 'custrecord_hc_lcc_cost_allocation_field' }),
            search.createColumn({ name: 'custrecord_hc_lcc_allocation_rule' }),

        ]
        let SearchObj = search.create({
            type: 'customrecord_hc_logistic_landed_cost',
            filters: [
                ['isinactive', 'is', false],
            ],
            columns: searchColumns
        });
        let obj = {};
        SearchObj.run().each(function (res) {
            obj[res.id] = {
                field: res.getValue('custrecord_hc_lcc_cost_allocation_field'),
            }
            return true;
        });
        return obj;
    }
    function get_search_results(search_id) {
        let res = [];
        let source_search = search.load({ id: search_id });
        let cols = source_search.columns;
        let pd = source_search.runPaged({ pageSize: 1000 });
        log.debug('all count', pd.count);
        if (pd.count > 0) {
            let page = pd.fetch({ index: 0 });
            res = get_page_results(page, cols);
            while (page.isLast != true) {
                page = page.next();
                res = res.concat(get_page_results(page, cols));
            }
        }
        return res;
    }
    function get_page_results(page, cols) {
        return page.data.map(function (dd) {
            let rr = {};
            rr.id = dd.id;
            cols.map(function (col, index) {
                rr[col.label] = dd.getValue(col);
            });
            return rr;
        });
    }
    function get_script_param(name) {
        return runtime.getCurrentScript().getParameter({ name: name });
    }
    e.getInputData = function () {
        const searchid = get_script_param(SEARCHFIELDID);
        let search_results = get_search_results(searchid);
        return R.groupBy(R.prop('id'))(search_results);
    }
    e.map = function (context) {
        try {
            const orderkey = context.key;
            const bill_data = JSON.parse(context.value);
            log.debug('bill_data', bill_data);
            log.debug('orderkey', orderkey);
            let shipping_data_obj = map_get_shipping_order_datas(bill_data[0].shipping_order);
            shipping_data_obj.lineArr.length > 0 ? map_cost_allocation(shipping_data_obj, bill_data,context) : ''
        } catch (error) {
            log.error('maperror', error);
        }
    }
    e.reduce = function (context) {
        log.debug('reducecontext', context);
        try {
            const key = context.key;
            const objres = context.values;
            objres.map(r => map_create_result(JSON.parse(r)));
        } catch (error) {
            log.error('reduceerror', error);
        }
    }
    e.summarize = function (summary) {

    }
    
});
