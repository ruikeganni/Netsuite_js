/**
 *@NApiVersion 2.1
*@NScriptType MapReduceScript
* Vic Yang create file
*/
define(["require", "exports", 'N/record', 'N/search', './ramda.min.js', 'N/runtime'],
function (r, e, _, search, R, runtime) {
    Object.defineProperty(e, "__esModule", {
        value: !0
    });
    const SEARCHFIELDID = 'custscript_wlyx_search_id';

    function get_script_param(name) {
        return runtime.getCurrentScript().getParameter({ name: name });
    }
    function gid_search_order_router() {
        let SearchObj = search.create({
            type: 'customrecord_hc_merchant_order_router',
            filters: [['isinactive', 'is', false]],
            columns: [search.createColumn({ name: 'custrecord_hc_mor_shipment_notice_in_adv' }),]
        });
        let check = '';
        SearchObj.run().each(function (res) {
            check = res.getValue('custrecord_hc_mor_shipment_notice_in_adv');
            return true;
        });
        return check;
    }
    function gid_search_order_logistics_rule(searchid) {
        let SearchObj = search.create({
            type: 'customrecord_hc_order_logistics_rule',
            filters: [['isinactive', 'is', false], 'and', ['custrecord_hc_olr_saved_search', 'is', searchid]],
            columns: [
                search.createColumn({ name: 'custrecord_hc_olr_fulfill_location' }),
                search.createColumn({ name: 'custrecord_hc_olr_logistics_vendor' }),
                search.createColumn({ name: 'custrecord_hc_olr_logistics_service' }),
                search.createColumn({ name: 'custrecord_hc_olr_sort_by_criteria' }),
                search.createColumn({ name: 'custrecord_hc_olr_sort_by_descending' }),
                search.createColumn({ name: 'custrecord_hc_olr_then_by_criteria' }),
                search.createColumn({ name: 'custrecord_hc_olr_then_by_descending' }),
                search.createColumn({ name: 'custrecord_hc_olr_last_by_criteria' }),
                search.createColumn({ name: 'custrecord_hc_olr_last_by_descending' }),
                search.createColumn({ name: 'custrecord_hc_olr_saved_search' }),
                search.createColumn({ name: 'custrecord_hc_olr_item_default_setting' }),

            ]
        });
        let dataJson = {};
        SearchObj.run().each(function (res) {
            dataJson.roleid = res.id;
            dataJson.searchid = res.getValue('custrecord_hc_olr_saved_search');
            dataJson.location = res.getValue('custrecord_hc_olr_fulfill_location');
            dataJson.vendor = res.getValue('custrecord_hc_olr_logistics_vendor');
            dataJson.service = res.getValue('custrecord_hc_olr_logistics_service');
            dataJson.sortby = res.getValue('custrecord_hc_olr_sort_by_criteria');
            dataJson.sortby_descend = res.getValue('custrecord_hc_olr_sort_by_descending');
            dataJson.thenby = res.getValue('custrecord_hc_olr_then_by_criteria');
            dataJson.thenby_descend = res.getValue('custrecord_hc_olr_then_by_descending');
            dataJson.lastby = res.getValue('custrecord_hc_olr_last_by_criteria');
            dataJson.lastby_descend = res.getValue('custrecord_hc_olr_last_by_descending');
            dataJson.isitem = res.getValue('custrecord_hc_olr_item_default_setting');
            return true;
        });
        return dataJson;
    }

    function map_check_line_item(modata, key) {
        let arr = [];
        modata.forEach(function (ele, index) {
            if (index > 0) { arr.push('or') }; arr.push(['name', 'is', ele['2']])
        });
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
                ['custrecord_hc_sku_customer', 'is', modata[0]['22']],
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
            dataArr.push(res.getValue('name'));
            return true;
        });
        let msg = '';
        for (let index = 0; index < modata.length; index++) {
        const element = modata[index];
        let arr = dataArr.filter(m => m==element[['2']]);//[element[['2']]]
        if (arr.length == 0) {
            msg += element[['2']] +':无映射关系;';
        }else if (arr.length > 1) {
            msg += element[['2']] +':映射关系不唯一;';
        }
        }
        if (msg) {
        let vv = {};
        vv.custrecord_hc_mo_abnormal_order = true;
        vv.custrecord_hc_mo_abnormal_message = msg;
        _.submitFields({ type: 'customrecord_hc_merchant_order', id: key, values: vv });
        return '';
        }
        return obj;
    }
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
            }
            return true;
        });
        return datajson;
    }
    function map_search_delivery_setting(location) {
        let searchColumns = [
            search.createColumn({ name: "custrecord_hc_dids_delivery_type" }),
            search.createColumn({ name: "custrecord_hc_dids_item" }),
            search.createColumn({ name: "custrecord_hc_dids_seller_shop" }),
            search.createColumn({ name: "custrecord_hc_dids_quantity_limit" }),
            search.createColumn({ name: "custrecord_hc_dids_location" }),
            search.createColumn({ name: "custrecord_hc_dids_carrier" }),
            search.createColumn({ name: "custrecord_hc_dids_logistics_service" }),
            search.createColumn({ name: "custrecord_hc_dids_subsidiary" }),
            search.createColumn({ name: "custrecord_hc_dids_first_location" }),
            search.createColumn({ name: "custrecord_hc_dids_sign" }),
            search.createColumn({ name: "custrecord_hc_dids_dtype_to" }),
            search.createColumn({ name: "custrecord_hc_dids_carrier_to" }),
            
        ]
        let searchFilter = [];
        searchFilter.push(['isinactive', 'is', false]);
        if (location && location!='') {
        searchFilter.push('and');
        searchFilter.push(['custrecord_hc_dids_location', 'anyof', location]);
        }else{
        searchFilter.push('and');
        searchFilter.push(['custrecord_hc_dids_first_location', 'is', true]);
        }
        var itemSearchObj = search.create({
            type: "customrecord_item_delivery_setting",
            filters: searchFilter,
            columns: searchColumns
        });
        let deliveryArr = [];
        itemSearchObj.run().each(function (res) {
            let datajson = {};
            datajson.delivery_type = res.getValue('custrecord_hc_dids_delivery_type');
            datajson.item = res.getValue('custrecord_hc_dids_item');
            datajson.shop = res.getValue('custrecord_hc_dids_seller_shop');
            datajson.quantity_limit = res.getValue('custrecord_hc_dids_quantity_limit');
            datajson.location = res.getValue('custrecord_hc_dids_location');
            datajson.vendor = res.getValue('custrecord_hc_dids_carrier');
            datajson.service = res.getValue('custrecord_hc_dids_logistics_service');
            datajson.sub = res.getValue('custrecord_hc_dids_subsidiary');
            datajson.first_location = res.getValue('custrecord_hc_dids_first_location');
            datajson.sign = res.getValue('custrecord_hc_dids_sign');
            datajson.dtype_to = res.getValue('custrecord_hc_dids_dtype_to');
            datajson.carrier_to = res.getValue('custrecord_hc_dids_carrier_to');
            deliveryArr.push(datajson);
            return true;
        });
        return deliveryArr;
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
    function dg_get(sonObj, arr, sum_obj, kitQty, count) {
        let inventObj = R.filter(r => r.type == 'InvtPart')(sonObj);
        let KitObj = R.filter(r => r.type == 'Kit')(sonObj);
        let sonArr = [];
        for (const key in inventObj) {
            const element = inventObj[key];
            sonArr.push(JSON.parse(JSON.stringify(element)));
        }
        log.debug('sonArr', sonArr);
        log.debug('kitQty', kitQty);
        log.debug('count', count);
        for (let index = 0; index < count; index++) {
            let cloneArr = [];
            sonArr.forEach(ele => {
                let e = JSON.parse(JSON.stringify(ele));
                e.qty = '';
                log.debug('ele1', e);
                if (index == count - 1) {
                    e.qty = (kitQty * Number(ele.memberqty || 1)) - ((Number(ele.memberqty) * index * Number(ele.parent_package_capacity || 1)))
                } else {
                    e.qty = Number(ele.memberqty) * Number(ele.parent_package_capacity || 1);
                }
                log.debug('ele2', e);
                cloneArr.push(e);
            });
            arr.push(cloneArr);
        }

        log.debug('inventObj', inventObj);
        log.debug('KitObj', KitObj);
        log.debug('arr', arr);
        if (Object.keys(KitObj).length > 0) {
            for (const key in KitObj) {
                const element = KitObj[key];
                let son_Obj = R.filter(r => r.parent == element.id)(sum_obj);
                return dg_get(son_Obj, arr, sum_obj, kitQty, count);
            }
        } else {
            return arr;
        }
    }

    function map_role_info_deal(deliveryArr, obj, orderqty, shop, isparent,sub) {
        //子公司
        let a = deliveryArr.filter(i => i.sub == sub);
        a = a.length == 0 ? deliveryArr.filter(i => i.sub == '') : a;
        //过滤shop
        let b = a.filter(i => i.shop == shop);
        b = b.length == 0 ? a.filter(i => i.shop == '') : b;
        //过滤item
        let c = b.filter(i => i.item == obj.id);
        c = c.length == 0 ? b.filter(i => i.item == '') : c;
        //过滤delivery_type
        let d = [];
        if (isparent) {
            d = c.filter(i => i.delivery_type == obj.parent_delivery_type);
        } else {
            d = c.filter(i => i.delivery_type == obj.delivery_type);
        }
        //过滤上限数量
        let e = d.filter(i => Number(i.quantity_limit) >= Number(orderqty));
        e = e.length == 0 ? d.filter(i => i.quantity_limit == '') : e;
        let rule_info = {};
        rule_info = e[0];
        return rule_info;
    }
    //数据平铺与处理
    function map_deal_with_datas(modata, orderkey, item_map, deliveryArr) {
        let sum_obj = {};
        sum_obj = map_dg_search_kit(item_map, sum_obj);
        let fulfill_line_Arr = [];

        modata.forEach(ele => {
            let parent = sum_obj[ele['2']];
            let shop = ele['22'];
            let sub = ele['23'];
            let orderqty = Number(ele['3']);
            //如果是库存货品
            if (parent && parent.type == 'InvtPart') {
                let count = 1;
                if (parent.package_capacity) {
                    count = Math.ceil(R.divide(Number(ele['3']))(Number(parent.package_capacity || 1)));
                }
                for (let index = 0; index < count; index++) {
                    let arr = [];
                    let json = {};
                    json.id = parent.id;
                    json.delivery_type = parent.delivery_type;
                    if (index == count - 1) {
                        json.qty = Number(ele['3']) - (index * Number(parent.package_capacity || 1));
                    } else {
                        json.qty = parent.package_capacity || 1;
                    }
                    json.sumAmount = Number(parent.rate) * Number(ele['3']);
                    json.rule_info = map_role_info_deal(deliveryArr, json, orderqty, shop, false,sub);
                    json.info = ele;
                    arr.push(json);
                    fulfill_line_Arr.push(arr);
                }
            } else {
                //组件和包裹货品
                let kitQty = Number(ele['3']);
                if (parent && parent.type == 'Kit') {
                    let sonObj = R.filter(r => r.parent == parent.id)(sum_obj);

                    let inventObj = R.filter(r => r.type == 'InvtPart')(sonObj);
                    let inventObj_ispack = R.filter(r => r.package_capacity)(inventObj);
                    let inventObj_isnotpack = R.filter(r => !r.package_capacity)(inventObj);
                    for (const key in inventObj_ispack) {
                        const element = inventObj_ispack[key];
                        let e = JSON.parse(JSON.stringify(element));
                        let inventAmount = Number(e.rate) * Number(kitQty) * Number(e.memberqty);
                        let count = 1;
                        if (e.package_capacity) {
                            count = Math.ceil(R.divide(kitQty * Number(e.memberqty))(Number(e.package_capacity || 1)));
                        }
                        for (let index = 0; index < count; index++) {
                            e = JSON.parse(JSON.stringify(e));
                            let sonArr = [];
                            if (index == count - 1) {
                                e.qty = (kitQty * Number(e.memberqty || 1)) - (index * Number(e.package_capacity || 1));
                            } else {
                                e.qty = e.package_capacity ? Number(e.package_capacity) : 1;
                            }

                            e.rule_info = map_role_info_deal(deliveryArr, e, kitQty * Number(e.memberqty), shop, false,sub);
                            e.info = ele;
                            sonArr.push(e);
                            fulfill_line_Arr.push(sonArr);
                        }
                    }
                    let isnotpack = [];
                    for (const key in inventObj_isnotpack) {
                        const element = inventObj_isnotpack[key];
                        let e = JSON.parse(JSON.stringify(element));

                        e.qty = (kitQty * Number(e.memberqty || 1));
                        e.rule_info = map_role_info_deal(deliveryArr, e, kitQty * Number(e.memberqty), shop,false,sub);
                        e.info = ele;
                        isnotpack.push(e);
                    }
                    isnotpack.length > 0 ? fulfill_line_Arr.push(isnotpack) : '';
                    let KitObj = R.filter(r => r.type == 'Kit')(sonObj);
                    if (Object.keys(KitObj).length > 0) {
                        for (const key in KitObj) {
                            const kitele = KitObj[key];
                            let son_Obj = R.filter(r => r.parent == kitele.id)(sum_obj);
                            let inventObj = R.filter(r => r.type == 'InvtPart')(son_Obj);
                            let count = 1;
                            if (kitele.package_capacity) {
                                count = Math.ceil(R.divide(kitQty * Number(kitele.memberqty))(Number(kitele.package_capacity || 1)));
                            }

                            for (let index = 0; index < count; index++) {
                                let sonArr = [];
                                for (const key in inventObj) {
                                    const element = inventObj[key];
                                    let e = JSON.parse(JSON.stringify(element));

                                    if (kitele.package_capacity) {
                                        if (index == count - 1) {
                                            e.qty = (kitQty * Number(kitele.memberqty || 1) * Number(e.memberqty)) - (index * Number(kitele.package_capacity || 1))
                                        } else {
                                            e.qty = Number(e.memberqty) * Number(kitele.package_capacity || 1);
                                        }
                                    } else {
                                        e.qty = (kitQty * Number(kitele.memberqty || 1) * Number(e.memberqty));
                                    }
                                    e.rule_info = map_role_info_deal(deliveryArr, e, kitQty * Number(kitele.memberqty), shop, true);
                                    e.info = ele;
                                    sonArr.push(e);
                                }
                                fulfill_line_Arr.push(sonArr);
                            }

                        }
                    }
                
                }

            }
        });
        return fulfill_line_Arr;

    }
    //调用reduce
    function map_create_fulfill_order(context, dataArr, orderkey) {
        dataArr.map(r => context.write({ key: orderkey, value: r }));
    }
    //校验库存
    function map_check_inventory(itemarr, key) {
        let itemidarr = [];
        itemarr.map(r => {
            r.map(i => {
                let obj = {};
                if (i.info.ruleInfo.isitem) {
                    obj.itemid = i.id;
                    obj.location = i.rule_info.location;
                    itemidarr.push(obj);
                } else {
                    obj.itemid = i.id;
                    obj.location = i.info.ruleInfo.location;
                    itemidarr.push(obj);
                }
            })
        });
        let ableArr = map_map_search_item_able(itemidarr);
        let fulArr = map_map_search_item_fulfill_qty(itemidarr);
        let flag = true;
        let witem = '无可用库存配送，请检查：';

        ableArr.forEach(ele => {
            if (ele.available == 0) { flag = false; witem += ele.itemname + ' 货品在 ' + ele.locationname + '无可用库存；'; };
            let a = fulArr.filter(r => r.item == ele.itemid && r.location == ele.location);
            if (a.length > 0) { if (Number(ele.available) - Number(a[0].qty) <= 0) { flag = false; witem += ele.itemname + ' 货品在 ' + ele.locationname + '无可用库存；'; } }
        });
        if (!flag) {
            let vv = {};
            vv.custrecord_hc_mo_abnormal_order = true;
            vv.custrecord_hc_mo_abnormal_message = witem;
            _.submitFields({ type: 'customrecord_hc_merchant_order', id: key, values: vv });

        }
        return flag;
    }
    //搜索可用量
    function map_map_search_item_able(itemid) {
        let search_filter = [];
        itemid.forEach(function (e, index) {
            if (index > 0) {
                search_filter.push('or');
            }
            let arr = [];
            arr = [['internalid', 'anyof', e.itemid], 'and', ['inventorylocation', 'anyof', e.location]];
            search_filter.push(arr);
        });
        var SearchObj = search.create({
            type: 'item',
            filters: search_filter,
            columns: [
                search.createColumn({ name: 'locationquantityavailable' }),
                search.createColumn({ name: 'inventorylocation' }),
                search.createColumn({ name: 'itemid' }),
                search.createColumn({
                    name: "namenohierarchy",
                    join: "inventoryLocation",
                })
            ]
        });
        let inventoryArr = [];
        SearchObj.run().each(function (result) {
            let obj = {};
            // .run().each has a limit of 4,000 results
            obj.available = result.getValue('locationquantityavailable') || 0;
            obj.itemid = result.id;
            obj.itemname = result.getValue('itemid');
            obj.location = result.getValue('inventorylocation');
            obj.locationname = result.getValue({
                name: "namenohierarchy",
                join: "inventoryLocation",
            });
            inventoryArr.push(obj);
            return true;
        });
        return inventoryArr;
    }
    //搜索占用量
    function map_map_search_item_fulfill_qty(itemid) {
        var SearchObj = search.load({ id: 'customsearch_hc_commited_fulfill_order' });
        let filexp = SearchObj.filterExpression;
        let deFilters = [];
        deFilters.push(filexp);
        deFilters.push('and')
        let search_filter = [];
        itemid.forEach(function (e, index) {
            if (index > 0) {
                search_filter.push('or');
            }
            let arr = [];
            arr = [['custrecord_hc_mofi_fulfillment_order.custrecord_hc_mofi_fulfillment_item', 'anyof', e.itemid], 'and', ['custrecord_hc_mofo_location', 'anyof', e.location]];
            search_filter.push(arr);
        });
        deFilters.push(search_filter);

        SearchObj.filterExpression = deFilters;
        let deColumns = SearchObj.columns;
        let arr = [];
        SearchObj.run().each(function (result) {
            let obj = {};
            // .run().each has a limit of 4,000 results
            obj.item = result.getValue(deColumns[1]);
            obj.qty = result.getValue(deColumns[0]) || 0;
            obj.location = result.getValue(deColumns[2]);
            arr.push(obj);
            return true;
        });
        return arr;
    }

    function reduce_search_mo_fulfill(ordername) {
        let name = '';
        var customrecord_hc_mo_fulfillment_orderSearchObj = search.create({
            type: "customrecord_hc_mo_fulfillment_order",
            filters:
                [
                    ["name", "startswith", ordername],
                    'and',
                    ['isinactive','is',false]
                ],
            columns:
                [
                    search.createColumn({
                        name: "name",
                        label: "名称"
                    }),
                    search.createColumn({
                    name: "formulanumeric",
                    formula: "TO_NUMBER(SUBSTR({name},INSTR({name}, '-',-1)+1))",
                    sort: search.Sort.DESC,
                    label: "公式（数值）"
                    })
                ]
        });
        customrecord_hc_mo_fulfillment_orderSearchObj.run().each(function (result) {
            // .run().each has a limit of 4,000 results
            name = result.getValue('name');
        });
        let arr = name ? name.split('-') : [];
        return arr.length > 0 ? Number(arr[arr.length - 1]) : 0;

    }
    function reduce_search_fulfill_to(createfrom,dtype_to,carrier) {
        let ifid = '';
        let search_filters = [["custrecord_hc_mofo_created_from", "anyof", createfrom],'and',['isinactive','is',false]];
        if (dtype_to) {
            search_filters.push('and');
            search_filters.push(["custrecord_hc_mofo_dids_dtype_to", "anyof", dtype_to]);
        }
        if (carrier) {
            search_filters.push('and');
            search_filters.push(["custrecord_hc_mofo_carrier", "anyof", carrier]);
        }
        var customrecord_hc_mo_fulfillment_orderSearchObj = search.create({
            type: "customrecord_hc_mo_fulfillment_order",
            filters:search_filters,
            columns:
                [
                    search.createColumn({
                        name: "name",
                        label: "名称"
                    })
                ]
        });
        customrecord_hc_mo_fulfillment_orderSearchObj.run().each(function (result) {
            // .run().each has a limit of 4,000 results
            ifid = result.id;
        });
        return ifid;

    }
    function reduce_create_order(obj, recid) {
        let res = obj[0];
        let ordername = res.info['19'] + '-OR-';
        let num = reduce_search_mo_fulfill(ordername);
        num = num == 0 || num == 'NaN' || !num ? '01' : num < 9 ? '0' + (num + 1) : num + 1;
        let rule = {};
        rule = res.info.ruleInfo.isitem ? res.rule_info : res.info.ruleInfo;
        log.debug('货品配送默认规则',rule);
        if (!rule) {
            let msg = '';
            msg='SKU缺少物流优选规则';
            let vv = {};
            vv.custrecord_hc_mo_abnormal_order = true;
            vv.custrecord_hc_mo_abnormal_message = msg;
            _.submitFields({ type: 'customrecord_hc_merchant_order', id: recid, values: vv });
            log.error('SKU缺少物流优选规则','SKU缺少物流优选规则');
            return '';
        }
        let dataMap = {
            'name': ordername + num,
            'custrecord_hc_mofo_created_from': recid,
            'custrecord_hc_mofo_type': 1,
            'custrecord_hc_mofo_country': res.info['4'],
            'custrecord_hc_mofo_city': res.info['5'],
            'custrecord_hc_mofo_state': res.info['6'],
            'custrecord_hc_mofo_district': '',
            'custrecord_hc_mofo_postal_code': res.info['7'],
            'custrecord_hc_mofo_country_code': res.info['8'],
            'custrecord_hc_mofo_county': res.info['8'],
            'custrecord_hc_mofo_recipient_name': res.info['9'],
            'custrecord_hc_mofo_phone': res.info['10'],
            'custrecord_hc_mofo_recipient_email': res.info['11'],
            'custrecord_hc_mofo_addressline1': res.info['12'],
            'custrecord_hc_mofo_address_type': res.info['13'],
            'custrecord_hc_mofo_addressline2': res.info['14'],
            'custrecord_hc_mofo_specified_logistics': res.info['15'],
            'custrecord_hc_mofo_company_name': res.info['25'],
            'custrecord_hc_mofo_addressline3':res.info['26'],
            'custrecord_hc_mofo_ship_service_level': '',//配送服务水平
            'custrecord_hc_mofo_logistics_rules': res.info.ruleInfo.roleid,
            'custrecord_hc_mofo_logistics_service': rule.service,
            'custrecord_hc_mofo_carrier': rule.vendor,
            'custrecord_hc_mofo_location': rule.location,
            'custrecord_hc_mofo_sign':rule.sign,
            'custrecord_hc_mofo_status': 2,
            'custrecord_hc_mofo_dids_dtype_to':rule.dtype_to,
            
            //'custrecord_fo_customer': res.info['0'], //店铺
            //'custrecord_fo_seller_profile': res.info['1'], //平台店铺

            'recmachcustrecord_hc_mofi_fulfillment_order': []
        }
        obj.map(r => {
            let lineData = {
                'custrecord_hc_mofi_sku': r.info.mappingid,
                'custrecord_hc_mofi_fulfillment_item': r.id,
                'custrecord_hc_mofi_quantity': r.qty,
                'custrecord_hc_mofi_unit_price': '',
                'custrecord_hc_mofi_tax_amount': '',
                'custrecord_hc_mofi_order_line': r.info['16'],
                'custrecord_hc_mofi_order_item_id': r.info['17'],
                'custrecord_hc_mofi_line_item_key': r.info['18'],
                'custrecord_hc_mofi_sku_fulfill_qty': r.qty,
                'custrecord_hc_mofi_parent_item': r.parent,
                'custrecord_hc_mofi_parent_item_qty': r.info['3'],
            }
            dataMap.recmachcustrecord_hc_mofi_fulfillment_order.push(lineData);
        });
        //产品类别或供应商与发货通知单一致，则做搜索符合条件的发货通知单，将明细行直接添加到发货通知单上
        let createFlag = true;
        let fulfillid = '';
        if (rule&&((rule.dtype_to&&rule.dtype_to==rule.delivery_type) || (rule.carrier_to&&rule.carrier_to==rule.vendor))) {
            let ifid = reduce_search_fulfill_to(recid,rule.dtype_to,rule.carrier_to);
            if (ifid) {
                const oldRec = _.load({ type: 'customrecord_hc_mo_fulfillment_order' ,id:ifid});
                add_sublist_value(dataMap, oldRec);
                fulfillid = oldRec.save();
                log.debug('合并fulfillid', `customrecord_hc_mo_fulfillment_order:${fulfillid}`);
                createFlag = false;
            }
        }
        if (createFlag) {
            const newRec = _.create({ type: 'customrecord_hc_mo_fulfillment_order' });
            set_body_sublist_value(dataMap, newRec);
            fulfillid = newRec.save();
            log.debug('新建fulfillid', `customrecord_hc_mo_fulfillment_order:${fulfillid}`);
        }

        
        const molineRec = _.load({ type: 'customrecord_hc_merchant_order_line', id: res.info['16'] });
        let fulfillment_line = molineRec.getValue({ fieldId: 'custrecord_hc_mol_fulfillment_line' });
        let lineArr = [];
        if (Array.isArray(fulfillment_line)) {
            fulfillment_line.push(fulfillid);
            molineRec.setValue({ fieldId: 'custrecord_hc_mol_fulfillment_line', value: fulfillment_line });
        } else {
            if (fulfillment_line) {
                lineArr.push(fulfillment_line);
            }
            lineArr.push(fulfillid);
            molineRec.setValue({ fieldId: 'custrecord_hc_mol_fulfillment_line', value: lineArr });
        }
        let molineid = molineRec.save();
        log.debug('回写mo明细id', `customrecord_hc_merchant_order_line:${molineid}`);
        let vv = {};
        vv.custrecord_hc_mo_fulfill_status = 2;
        _.submitFields({ type: 'customrecord_hc_merchant_order', id: recid, values: vv });

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
                if (dataMap[key]) {
                    newRec.setValue({ fieldId: key, value: dataMap[key] });

                    //赋值店铺，平台店铺
                    try{
                        if(key == 'custrecord_hc_mofo_created_from'){
                            var moRec = search.lookupFields({
                                type:'customrecord_hc_merchant_order',
                                id: dataMap[key],
                                columns: ['custrecord_hc_mo_customer', 'custrecord_hc_mo_seller_profile']
                            });
                            newRec.setValue('custrecord_fo_customer', moRec.custrecord_hc_mo_customer[0].value);
                            newRec.setValue('custrecord_fo_seller_profile', moRec.custrecord_hc_mo_seller_profile[0].value);
                        }
                    }catch(e){}
                }
            }
        }
    }
    function add_sublist_value(dataMap, newRec) {
        const lineCount = newRec.getLineCount({sublistId: 'recmachcustrecord_hc_mofi_fulfillment_order'});
        let int = lineCount;
        for (const key in dataMap) {
            //处理子列表字段赋值
            if (key.substr(0, 7) == "recmach") {
                dataMap[key].forEach(function (ele, sublistIndex) {
                    for (const sublistfieldKey in ele) {
                        if (ele[sublistfieldKey]) {
                            newRec.setSublistValue({ sublistId: key, fieldId: sublistfieldKey, value: ele[sublistfieldKey], line: int });
                        }
                    }
                    int++;
                });
            } 
        }
    }
    e.getInputData = function () {
        const searchid = get_script_param(SEARCHFIELDID);
        log.debug('searchid', searchid);
        //是否物流优选
        const check = gid_search_order_router();
        log.debug('是否物流优选', check);
        //物流优选规则
        const ruleInfo = gid_search_order_logistics_rule(searchid);
        if (check && ruleInfo.searchid) {
            let search_results = get_search_results(searchid);
            search_results.map(sr => sr.ruleInfo = ruleInfo);
            return R.groupBy(R.prop('id'))(search_results);
        }
    }
    e.map = function (context) {
        const orderkey = context.key;
        const modata = JSON.parse(context.value);
        try {
            let item_map = map_check_line_item(modata, orderkey);
            if (item_map) {
                let mo_location = modata[0]['24'];
                let deliveryArr = map_search_delivery_setting(mo_location);
                modata.map(r => { 
                    r.mappingid = item_map[r['2']].mappingid; 
            });
                let dataArr = map_deal_with_datas(modata, orderkey, item_map, deliveryArr);
                if (mo_location && map_check_inventory(dataArr, orderkey)) { //校验库存
                    map_create_fulfill_order(context, dataArr, orderkey);
                }else if (!mo_location) {
                    map_create_fulfill_order(context, dataArr, orderkey);
                }
            }
        } catch (error) {
            log.error('maperror', error);
            error=error+'';
            let msg = '';
            if (error.indexOf('mappingid')>-1) {
            msg='SKU无映射关系或不唯一';
            }else if (error.indexOf('location')>-1) {
            msg='SKU缺少物流优选规则';
            }else{
            msg=error;
            }
            let vv = {};
            vv.custrecord_hc_mo_abnormal_order = true;
            vv.custrecord_hc_mo_abnormal_message = msg;
            _.submitFields({ type: 'customrecord_hc_merchant_order', id: orderkey, values: vv });
        }
        //context.write({ key: obj.id, value: reduceJson });
    }

    e.reduce = function (context) {
        log.debug('reducecontext', context);
        try {
            const key = context.key;
            const objres = context.values;
            objres.map(r => reduce_create_order(JSON.parse(r), key));
        } catch (error) {
            log.error('reduceerror', error);
        }
    }
    e.summarize = function (summary) {

    }
    function get_search_results(search_id) {
        let res = [];
        let source_search = search.load({ id: search_id });
        let cols = source_search.columns;
        let pd = source_search.runPaged({ pageSize: 1000 });
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
                rr[index] = dd.getValue(col);
            });
            return rr;
        });
    }

});