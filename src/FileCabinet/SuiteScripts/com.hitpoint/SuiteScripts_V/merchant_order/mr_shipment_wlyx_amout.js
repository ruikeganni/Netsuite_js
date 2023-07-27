/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
 define(["require", "exports", 'N/record', 'N/search', './ramda.min.js', 'N/runtime', 'N/currency'],
 function (r, e, _, search, R, runtime, currency) {
     Object.defineProperty(e, "__esModule", {
         value: !0
     });
     const SEARCHFIELDID = 'custscript_wlyx_amount_search_id';
     const RECORDTYPE = 'custscript_record_type';
     function get_script_param(name) {
         return runtime.getCurrentScript().getParameter({ name: name });
     }
     //搜索sku与item的mapping
     function map_check_line_item(modata, key) {
         let arr = [];
         modata.forEach(function (ele, index) {
             if (index > 0) { arr.push('or') }; arr.push(['name', 'is', ele.sku])
         });
         log.debug('arr', arr);
         let searchColumns = [
             search.createColumn({ name: 'name' }),
             search.createColumn({ name: 'custrecord_hc_sku_item' }),
             search.createColumn({ name: 'type', join: 'custrecord_hc_sku_item' }),
             search.createColumn({ name: 'custitem_hc_standard_package_capacity', join: 'custrecord_hc_sku_item' }),
             search.createColumn({ name: 'custitem_hc_reference_retail_price', join: 'custrecord_hc_sku_item' }),
             search.createColumn({ name: 'custitem_hc_item_delivery_type', join: 'custrecord_hc_sku_item' }),
         ]
         let SearchObj = search.create({
             type: 'customrecord_hc_sku',
             filters: [
                 ['isinactive', 'is', false],
                 'and',
                 ['custrecord_hc_sku_customer', 'is', modata[0].custrecord_hc_skucm_seller_profile],
                 'and',
                 arr
             ],
             columns: searchColumns
         });
         let dataArr = [];
         let obj = {};
         SearchObj.run().each(function (res) {
             obj[res.getValue('name')] = {
                 id: res.getValue('custrecord_hc_sku_item'),
                 type: res.getValue(searchColumns[2]),
                 package_capacity: res.getValue(searchColumns[3]),
                 mappingid: res.id,
                 rate: res.getValue(searchColumns[4]),
                 delivery_type: res.getValue(searchColumns[5]),
             }
             dataArr.push(res.getValue('custrecord_hc_sku_item'));
             return true;
         });
         log.debug('obj', obj);
         log.debug('dataArr', dataArr);
         let msg = '';
         for (let index = 0; index < modata.length; index++) {
            const element = modata[index];
            log.debug('element',element);
            if (!obj[element.sku]) {
                msg += element.sku +':无映射关系;';
            }
         }
         if (msg) {
            let vv = {};
            vv.custrecord_hc_mo_abnormal_order = true;
            vv.custrecord_hc_mo_abnormal_message = msg;
            _.submitFields({ type: 'customrecord_hc_merchant_order', id: key, values: vv });
            return '';
         }
        //  if (dataArr.length == 0) {
             
        //  }

        //  if (R.keys(obj).length != modata.length || modata.length != dataArr.length) {
        //  }
         return obj;
     }
     //数据平铺与处理
     function map_deal_with_datas(modata, orderkey, item_map) {
         log.debug('item_map', item_map);
         let sum_obj = {};
         sum_obj = map_dg_search_kit(item_map, sum_obj);
         log.debug('sum_obj3', sum_obj);
         log.debug('modata', modata);
         map_modata_line_amount(modata, sum_obj);
         log.debug('modata', modata);
         return map_modata_deal(modata, sum_obj,orderkey);
     }
     function map_map_rec_obj(res, ele, qty, rate, amount, unit_tax, tax) {
         return {
             custrecord_hc_skucm_transaction_type: ele.rectype=='customrecord_hc_merchant_order'?1:2,
             custrecord_hc_skucm_level: 2,
             custrecord_hc_skucm_name: res.itemid,
             custrecord_hc_skucm_order_id: ele.custrecord_hc_skucm_order_id,
             custrecord_hc_skucm_date: ele.custrecord_hc_skucm_date,
             custrecord_hc_skucm_seller_profile: ele.custrecord_hc_skucm_seller_profile,
             custrecord_hc_skucm_subsidiary: ele.custrecord_hc_skucm_subsidiary,
             custrecord_hc_skucm_quantity: qty,
             custrecord_hc_skucm_unit_rate: ele.custrecord_hc_skucm_currency==8?Math.round(rate):rate.toFixed(2),
             custrecord_hc_skucm_fxamount: ele.custrecord_hc_skucm_currency==8?Math.round(amount):amount,
             custrecord_hc_skucm_unit_taxamount: ele.custrecord_hc_skucm_currency==8?Math.round(unit_tax):unit_tax.toFixed(2),
             custrecord_hc_skucm_taxamount: ele.custrecord_hc_skucm_currency==8?Math.round(tax):tax,
             custrecord_hc_skucm_currency: ele.custrecord_hc_skucm_currency,
             custrecord_hc_skucm_inventory_item: res.id,
             custrecord_hc_skucm_exchangerate: '',
             custrecord_hc_skucm_country_of_receipt: ele.custrecord_hc_skucm_country_of_receipt,
             custrecord_hc_skucm_country_of_taxation: ele.custrecord_hc_skucm_country_of_taxation,
             custrecord_hc_skucm_tax_rate: Number(ele.tax) / Number(ele.amount),
             custrecord_hc_skucm_order_line: ele.custrecord_hc_skucm_order_line,
             custrecord_hc_skucm_exchangerate: currency.exchangeRate({ source: ele.custrecord_hc_skucm_currency, target: ele.sub_currency }),
             custrecord_hc_skucm_customer:ele.customer,
             rectype:'InvtPart'
         }
     }
     function map_modata_deal(modata, kitObj,key) {
         let fulfill_line_Arr = [];
         modata.forEach(ele => {
             let line_qty = ele.orderqty;
             let line_rate = ele.rate;
             let line_amount = ele.sumAmount;
             let line_tax = ele.tax;
             
             if (kitObj[ele.sku]) {
                 
                 let obj = {};
                 obj.custrecord_hc_skucm_inventory_item =kitObj[ele.sku].id;
                 obj.rectype = kitObj[ele.sku].type;
                 obj.custrecord_hc_skucm_transaction_type =  ele.rectype=='customrecord_hc_merchant_order'?1:2;
                 obj.custrecord_hc_skucm_level = 1;
                 obj.custrecord_hc_skucm_name = ele.sku;
                 obj.custrecord_hc_skucm_order_id = ele.custrecord_hc_skucm_order_id;
                 obj.custrecord_hc_skucm_date = ele.custrecord_hc_skucm_date;
                 obj.custrecord_hc_skucm_seller_profile = ele.custrecord_hc_skucm_seller_profile;
                 obj.custrecord_hc_skucm_subsidiary = ele.custrecord_hc_skucm_subsidiary;
                 obj.custrecord_hc_skucm_quantity = ele.orderqty;
                 obj.custrecord_hc_skucm_unit_rate = ele.rate;
                 obj.custrecord_hc_skucm_fxamount = ele.amount;
                 obj.custrecord_hc_skucm_unit_taxamount = Number(ele.tax) / Number(ele.orderqty);
                 obj.custrecord_hc_skucm_currency = ele.custrecord_hc_skucm_currency
                 obj.custrecord_hc_skucm_country_of_receipt = ele.custrecord_hc_skucm_country_of_receipt;
                 obj.custrecord_hc_skucm_country_of_taxation = ele.custrecord_hc_skucm_country_of_taxation;
                 obj.custrecord_hc_skucm_tax_rate = Number(ele.tax) / Number(ele.amount);
                 obj.custrecord_hc_skucm_order_line = ele.custrecord_hc_skucm_order_line;
                 obj.custrecord_hc_skucm_seller_sku = kitObj[ele.sku].mappingid;
                 obj.custrecord_hc_skucm_taxamount = ele.tax;
                 obj.custrecord_hc_skucm_customer=ele.customer;
                 obj.custrecord_hc_skucm_exchangerate = currency.exchangeRate({ source: ele.custrecord_hc_skucm_currency, target: ele.sub_currency });
                 fulfill_line_Arr.push(obj);
                 //第一层kit
                 if (kitObj[ele.sku].type == 'Kit') {
                     let First_inventObj = R.filter(i => i.parent == kitObj[ele.sku].id && i.type == 'InvtPart')(kitObj);
                     log.debug('First_inventObj', First_inventObj);
                     let First_KitObj = R.filter(i => i.parent == kitObj[ele.sku].id && i.type == 'Kit')(kitObj);
                     R.map(i => {
                         let qty = Number(line_qty) * Number(i.memberqty);
                         // let rate = Number(i.rate) * qty / Number(line_amount) * Number(line_rate) * Number(line_qty) / qty;
                         // let amount = (Number(rate).toFixed(6) * Number(qty)).toFixed(2);
                         let amount = (Number(i.rate) * qty / Number(line_amount) * Number(line_rate) * Number(line_qty)).toFixed(2);
                         let rate = Number(amount) / Number(qty);
                         let tax = (Number(line_tax) / (Number(line_qty) * Number(line_rate)) * amount).toFixed(2);
                         // let unit_tax = Number(line_tax) / (Number(line_qty) * Number(line_rate)) * rate;
                         let unit_tax = Number(tax) / Number(qty);
                         fulfill_line_Arr.push(map_map_rec_obj(i, ele, qty, rate, amount, unit_tax, tax))
                     })(First_inventObj);
                     //第二层Kit
                     R.map(m => {
                         let Second_inventObj = R.filter(i => i.parent == m.id && i.type == 'InvtPart')(kitObj);
                         R.map(k => {
                             let qty = Number(m.memberqty) * line_qty * Number(k.memberqty);
                             // let rate = qty * Number(k.rate) / Number(line_amount) * Number(line_rate) * Number(line_qty) / qty;
                             // let amount = (Number(rate).toFixed(6) * Number(qty)).toFixed(2);
                             let amount = (Number(k.rate) * qty / Number(line_amount) * Number(line_rate) * Number(line_qty)).toFixed(2);
                             let rate = Number(amount) / Number(qty);
                             let tax = (Number(line_tax) / (Number(line_qty) * Number(line_rate)) * amount).toFixed(2);
                             // let unit_tax = Number(line_tax) / (Number(line_qty) * Number(line_rate)) * rate;
                             let unit_tax = Number(tax) / Number(qty);
                             fulfill_line_Arr.push(map_map_rec_obj(k, ele, qty, rate, amount, unit_tax, tax))
                         })(Second_inventObj)
                     })(First_KitObj)

                 }
                 
                 //处理尾差
                 let arr = [];
                 let taxarr = [];
                 let wc_amount = 0;
                 let lineamount = 0;
                 let taxlineAmount = 0;
                 let wc_tax_amount = 0;
                 fulfill_line_Arr.filter(i => i.custrecord_hc_skucm_level == 2 && i.custrecord_hc_skucm_order_line == ele.custrecord_hc_skucm_order_line).map(r=> {arr.push(r.custrecord_hc_skucm_fxamount);taxarr.push(r.custrecord_hc_skucm_taxamount)});
                 arr.map(r=>lineamount = Number(lineamount)+ Number(r));
                 taxarr.map(r=>taxlineAmount = Number(taxlineAmount)+ Number(r));
                 wc_amount = Number(ele.amount) - Number(lineamount);
                 wc_tax_amount = Number(ele.custrecord_hc_skucm_taxamount) - Number(taxlineAmount);
                 log.debug('taxlineAmount',taxlineAmount);
                 log.debug('lineamount',lineamount);
                 log.debug('wc_amount',wc_amount);
                 log.debug('wc_tax_amount',wc_tax_amount);
                 fulfill_line_Arr.filter(i => i.custrecord_hc_skucm_fxamount == Math.max(...arr) && i.custrecord_hc_skucm_order_line == ele.custrecord_hc_skucm_order_line).map(r=>r.custrecord_hc_skucm_fxamount=(R.add(Number(r.custrecord_hc_skucm_fxamount))(Number(wc_amount))).toFixed(2));
                 fulfill_line_Arr.filter(i => i.custrecord_hc_skucm_fxamount == Math.max(...taxarr) && i.custrecord_hc_skucm_order_line == ele.custrecord_hc_skucm_order_line).map(r=>r.custrecord_hc_skucm_fxamount=(R.add(Number(r.custrecord_hc_skucm_taxamount))(Number(wc_tax_amount))).toFixed(2));
             }
         });
         log.debug('fulfill_line_Arr_result',fulfill_line_Arr);
         if (modata[0].rectype && modata[0].rectype =='customrecord_hc_merchant_order') {
             map_return_mo(modata,fulfill_line_Arr,key);
         }
         return fulfill_line_Arr;
     }
     function map_return_mo(modata,fulfill_line_Arr,key) {
         let itemArr = [];
         let location = modata[0].location;
         let sumCost = 0;
         let commission = modata[0].commission;
         let totalamount = modata[0].totalamount;
         let searchColumns = [];
         let searchFilters = [];
         fulfill_line_Arr.filter(r => r.rectype == 'InvtPart').map(i=> itemArr.push(i.custrecord_hc_skucm_inventory_item));
         if (modata[0].fulfill_type == 1) {
             searchFilters = [
                 ['internalid','anyof',itemArr],'and',['inventorylocation', 'anyof', location]
             ];
             searchColumns = [
                 search.createColumn({name: "locationaveragecost"}),
             ]
         }else{
             searchFilters = [
                 ['internalid','anyof',itemArr]
             ];
             searchColumns = [
                 search.createColumn({name: "averagecost"}),
             ];
         }
         let costObj = map_search_item_cost(searchFilters,searchColumns);
         fulfill_line_Arr.map(r => sumCost = sumCost+ (Number(costObj[r.custrecord_hc_skucm_inventory_item])*Number(r.custrecord_hc_skucm_quantity)));
         
         let commissionAmount = commission.indexOf('%')>-1 ?toPoint(commission) * Number(totalamount):commission;
         log.debug('sumCost',sumCost);
         log.debug('commissionAmount',commissionAmount);
         let toPoint=function(percent){
             var str=percent.replace("%","");
             str= Number(str)/100;
             return str;
         }
         let vv = {
             custrecord_hc_mo_inventory_cost:sumCost,
             custrecord_hc_mo_selling_fee:commissionAmount
         }
         log.debug('vv',vv);
         _.submitFields({type: 'customrecord_hc_merchant_order', id: key, values: vv});

     }
     function map_search_item_cost(searchFilters,searchColumns) {
         var itemSearchObj = search.create({
             type: "item",
             filters:searchFilters,
             columns:searchColumns,
          });
          let datajson = {};
          itemSearchObj.run().each(function(res){
             datajson[res.id] = res.getValue(searchColumns[0]);
             return true;
          });
          log.debug('datajson',datajson);
          return datajson;
     }
     function map_modata_line_amount(modata, kitObj) {
         modata.forEach(ele => {
             let sumAmount = 0;
             let line_qty = ele.orderqty;
             if (kitObj[ele.sku]) {
                 //第一层kit
                 if (kitObj[ele.sku].type == 'Kit') {
                     let First_inventObj = R.filter(i => i.parent == kitObj[ele.sku].id && i.type == 'InvtPart')(kitObj);
                     log.debug('First_inventObj', First_inventObj);
                     let First_KitObj = R.filter(i => i.parent == kitObj[ele.sku].id && i.type == 'Kit')(kitObj);
                     R.map(i => {
                         sumAmount += Number(i.rate) * Number(line_qty) * Number(i.memberqty);
                     })(First_inventObj);
                     //第二层Kit
                     R.map(m => {
                         let Second_inventObj = R.filter(i => i.parent == m.id && i.type == 'InvtPart')(kitObj);
                         R.map(k => {
                             sumAmount += Number(m.memberqty) * line_qty * Number(k.memberqty) * Number(k.rate);
                         })(Second_inventObj)
                     })(First_KitObj)
                     ele.sumAmount = sumAmount;
                 } else {
                     ele.sumAmount = Number(ele.rate) * Number(ele.orderqty);
                 }
             }
         });
     }
     //递归下钻kit
     function map_dg_search_kit(obj, sum_obj) {
         let kitArr = [];
         let flag = true;
         sum_obj = R.merge(obj)(sum_obj);
         let kit_son_obj = {};
         let isKit = n => n.type === 'Kit';
         let pusharr = x => kitArr.push(x.id);
         R.map(pusharr)(R.filter(isKit)(obj));
         if (kitArr.length > 0) flag = false;
         if (!flag) {
             kit_son_obj = map_search_member_item(kitArr);
             return map_dg_search_kit(kit_son_obj, sum_obj);
         } else {
             return sum_obj;
         }
     }
     //搜索KIt项目
     function map_search_member_item(kitArr) {
         let searchColumns = [
             search.createColumn({ name: "itemid", join: "memberItem", label: "名称" }),
             search.createColumn({ name: "type", join: "memberItem", label: "类型" }),
             search.createColumn({ name: "custitem_hc_standard_package_capacity", join: "memberItem", label: "包裹容量" }),
             search.createColumn({ name: "memberquantity", label: "会员数量" }),
             search.createColumn({ name: "memberitem", label: "会员项目" }),
             search.createColumn({ name: "custitem_hc_standard_package_capacity", label: "会员项目" }),
             search.createColumn({ name: "custitem_hc_reference_retail_price", join: "memberItem" }),
             search.createColumn({ name: "custitem_hc_item_delivery_type" }),
             search.createColumn({ name: "custitem_hc_item_delivery_type", join: "memberItem" }),
             search.createColumn({ name: "itemid", label: "名称" }),
         ]
         var itemSearchObj = search.create({
             type: "item",
             filters:
                 [
                     'internalid', 'anyof', kitArr
                 ],
             columns: searchColumns

         });
         let datajson = {};
         itemSearchObj.run().each(function (res) {
             // .run().each has a limit of 4,000 results
             datajson[res.id + '_' + res.getValue(searchColumns[4])] = {
                 type: res.getValue(searchColumns[1]),
                 package_capacity: res.getValue(searchColumns[2]),
                 memberqty: res.getValue(searchColumns[3]),
                 id: res.getValue(searchColumns[4]),
                 parent: res.id,
                 parent_package_capacity: res.getValue(searchColumns[5]),
                 rate: res.getValue(searchColumns[6]),
                 parent_delivery_type: res.getValue(searchColumns[7]),
                 delivery_type: res.getValue(searchColumns[8]),
                 itemid: res.getValue(searchColumns[0]),
                 parent_itemid: res.getValue(searchColumns[9]),
             }
             return true;
         });
         log.debug('datajson', datajson);
         return datajson;
     }
     //调用reduce
     function map_create_fulfill_order(context, dataArr, orderkey) {
         dataArr.map(r => context.write({ key: orderkey, value: r }));
     }
     function reduce_search_mo_fulfill(obj) {
        var customrecord_hc_mo_fulfillment_orderSearchObj = search.create({
            type: "customrecord_hc_sku_revenue_cost_cm",
            filters:
            [
               ["custrecord_hc_skucm_order_line","is",obj.custrecord_hc_skucm_order_line],
               'and',
               ["custrecord_hc_skucm_level","is",1]
            ],
            columns:
            [
               search.createColumn({ name: "custrecord_hc_skucm_seller_sku"}),
            ]
         });
         customrecord_hc_mo_fulfillment_orderSearchObj.run().each(function(result){
            // .run().each has a limit of 4,000 results
            obj.custrecord_hc_skucm_seller_sku = result.getValue('custrecord_hc_skucm_seller_sku');
            obj.custrecord_hc_skucm_sku_level_record =result.id;
         });
     }
     function reduce_create_order(obj, recid) {
         const newRec = _.create({ type: 'customrecord_hc_sku_revenue_cost_cm' });
         reduce_search_mo_fulfill(obj);
         log.debug('obj', obj);
         set_body_sublist_value(obj, newRec);
         const fulfillid = newRec.save();
         log.debug('fulfillid', fulfillid);
     }
     //body和明细行赋值
     function set_body_sublist_value(dataMap, newRec) {
         for (const key in dataMap) {
             //处理子列表字段赋值
             if (key.substr(0, 7) == "recmach") {
                 dataMap[key].forEach(function (ele, sublistIndex) {
                     for (const sublistfieldKey in ele) {
                         if (ele[sublistfieldKey]) {
                             newRec.setSublistValue({ sublistId: key, fieldId: sublistfieldKey, value: ele[sublistfieldKey], line: sublistIndex })
                         }
                     }
                 });
             } else {
                 //body字段赋值
                 if (key!='rectype') {
                     if (key == 'custrecord_hc_skucm_date') {
                         dataMap[key] ? newRec.setText({ fieldId: key, text: dataMap[key] }) : '';
                     } else {
                         dataMap[key] ? newRec.setValue({ fieldId: key, value: dataMap[key] }) : '';
                     }
                 }
             }
         }
     }
     e.getInputData = function () {
         const searchid = get_script_param(SEARCHFIELDID);
         let search_results = get_search_results(searchid);
         //  search_results.map(sr => sr.ruleInfo = ruleInfo);
         log.debug('R.groupBy(R.prop', R.groupBy(R.prop('id'))(search_results));
         return R.groupBy(R.prop('id'))(search_results);
     }
     e.map = function (context) {
         try {
             const orderkey = context.key;
             const modata = JSON.parse(context.value);
             let item_map = map_check_line_item(modata, orderkey);
             let restultArr = R.keys(item_map).length > 0 ? map_deal_with_datas(modata, orderkey, item_map) : [];
             restultArr.length > 0 ? map_create_fulfill_order(context, restultArr, orderkey) : false;
         } catch (error) {
             log.error('maperror', error);
         }
     }
     e.reduce = function (context) {
         log.debug('reducecontext', context);
         const rectype = get_script_param(RECORDTYPE);
         try {
             const key = context.key;
             const objres = context.values;
             objres.map(r => reduce_create_order(JSON.parse(r), key));
             if (rectype == 'customrecord_hc_merchant_order') {
                 _.submitFields({type: 'customrecord_hc_merchant_order', id: key, values: {custrecord_hc_mo_revenuecalculation_done:true}});
             }else if (rectype == 'customrecord_hc_mo_return_authorisation') {
                 _.submitFields({type: 'customrecord_hc_mo_return_authorisation', id: key, values: {custrecord_morma_cm_revenue:true}});
             }
         } catch (error) {
             log.error('reduceerror', error);
             if (rectype == 'customrecord_hc_merchant_order') {
                 _.submitFields({type: 'customrecord_hc_merchant_order', id: key, values: {custrecord_hc_mo_revenuecalculation_note:error.message}});
             }else if (rectype == 'customrecord_hc_mo_return_authorisation') {
                 // _.submitFields({type: 'customrecord_hc_mo_return_authorisation', id: key, values: {custrecord_morma_cm_revenue:true}});
             }
         }
     }
     e.summarize = function (summary) {

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
 });
