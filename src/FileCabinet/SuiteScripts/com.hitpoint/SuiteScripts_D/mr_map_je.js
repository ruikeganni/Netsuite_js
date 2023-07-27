/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 *
 *
 * ver             author                 mark                              date
 * 1               dami                   init                              20220425
 *
 *
 *
 *
 */
define(['N/record', 'N/search','N/runtime','N/url','N/https'],
    /**
 * @param{record} record
 * @param{search} search
 */
    (record, search,runtime,url,https) => {
        /**
         * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
         * @param {Object} inputContext
         * @param {boolean} inputContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Object} inputConetext.ObjectRef - Object that references the input data
         * @typedef {Object} ObjectRef
         * @property {string|number} ObjectRef.id - Internal ID of the record instance that contains the input data
         * @property {string} ObjectRef.type - Type of the record instance that contains the input data
         * @returns {Array|Object|Search|ObjectRef|File|Query} The input data to use in the map/reduce process
         * @since 2015.2
         */

        const getInputData = (inputContext) => {
            let returndata = []
            let cost_json = {}
            let ia_search = search.load({
                id:'customsearch_hc_pending_logisitc_cogs_ia'
            })
            let return_json = {}
            let cost_category = search.create({
                type:'customrecord_hc_logistic_landed_cost',
                filters:[
                    ['isinactive','is','F']
                ],
                columns:[
                    search.createColumn({name:'internalid'}),
                    search.createColumn({name:'custrecord_hc_lcc_asset_account'}),
                    search.createColumn({name:'custrecord_hc_lcc_cost_allocation_field'}),
                    search.createColumn({name:'name'})
                ]
            })
            let cost_ret = runsearch(cost_category).getAllData
            log.debug('cost_ret',cost_ret)

            if(cost_ret && cost_ret.length > 0){
                for(let c_i = 0;c_i < cost_ret.length;c_i++){
                    cost_json[cost_ret[c_i].getValue('internalid')] = {account:cost_ret[c_i].getValue('custrecord_hc_lcc_asset_account'),field:cost_ret[c_i].getValue('custrecord_hc_lcc_cost_allocation_field'),name:cost_ret[c_i].getValue('name')}
                }
            }
            log.debug('return_json1',return_json)

            let ia_ret = runsearch(ia_search).getAllData
            log.debug('ia_ret',ia_ret)

            if(ia_ret && ia_ret.length > 0){
                for(let n_i = 0;n_i < ia_ret.length;n_i++){
                    let line_internalid = ia_ret[n_i].getValue('internalid')
                    if(return_json[line_internalid] == null || return_json[line_internalid] == undefined || return_json[line_internalid] == ''){
                        return_json[line_internalid] = []
                        return_json[line_internalid].push(cost_json)

                    }
                    let line_json = {
                        internalid:ia_ret[n_i].getValue('internalid'),
                        item:ia_ret[n_i].getValue('item'),
                        quantity:ia_ret[n_i].getValue('quantity'),
                        location:ia_ret[n_i].getValue('location'),
                        costrecord:ia_ret[n_i].getValue('custcol_hc_landed_cost_record')
                    }
                    return_json[line_internalid].push(line_json)
                }
            }
            log.debug('return_json',return_json)
            for(let key in  return_json){
                returndata.push(return_json[key])
            }
            log.debug('returndata',returndata)
            return returndata;
        }

        /**
         * Defines the function that is executed when the map entry point is triggered. This entry point is triggered automatically
         * when the associated getInputData stage is complete. This function is applied to each key-value pair in the provided
         * context.
         * @param {Object} mapContext - Data collection containing the key-value pairs to process in the map stage. This parameter
         *     is provided automatically based on the results of the getInputData stage.
         * @param {Iterator} mapContext.errors - Serialized errors that were thrown during previous attempts to execute the map
         *     function on the current key-value pair
         * @param {number} mapContext.executionNo - Number of times the map function has been executed on the current key-value
         *     pair
         * @param {boolean} mapContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} mapContext.key - Key to be processed during the map stage
         * @param {string} mapContext.value - Value to be processed during the map stage
         * @since 2015.2
         */

        const map = (mapContext) => {
            let data_value =  JSON.parse(mapContext.value);
            log.debug('data_value',data_value)
            //第0个参数为landed_cost  后面则为IA的值
            let lande_cost = data_value[0];
            let sku_cost = []
            let ship_order = ''
            let ship_order_text = ''
            let sku_json = {}
            let os_json = {}
            let je_data = []
            let bill_order = ''
            let evn = runtime.envType
            let debit_account = ''
            let location = ''
            let iaid = ''
            if(evn  == 'SANDBOX'){
                debit_account = 221
            }else{
                debit_account = 216
            }
            try{
                for(let ia_i = 1;ia_i < data_value.length;ia_i++){
                    log.debug('2',data_value[ia_i])
                    let line_cost_detail = data_value[ia_i].costrecord
                    iaid = data_value[ia_i].internalid
                    if(line_cost_detail){
                        if(sku_cost.indexOf(line_cost_detail)== -1){
                            sku_cost.push(line_cost_detail)
                        }
                    }
                }
                if(sku_cost.length > 0){
                    let sku_search = search.create({
                        type:'customrecord_hc_sku_costallocationresult',
                        filters:[
                            ['isinactive','is','F'],
                            'AND',
                            ['internalid','anyof',sku_cost]

                        ],
                        columns:[
                            search.createColumn({name:'custrecord_hc_scar_freight_by_unit'}),
                            search.createColumn({name:'custrecord_hc_scar_duty_charges_by_unit'}),
                            search.createColumn({name:'custrecord_hc_scar_other_fees_by_unit'}),
                            search.createColumn({name:'custrecord_hc_scar_shipping_order'}),
                            search.createColumn({name:'custrecord_hc_scar_shipping_order_line'}),
                            search.createColumn({name:'custrecord_hc_scar_bill_fee_by_unit'}),
                            search.createColumn({name:'custrecordhc_scar_customcharges_by_unit'}),
                            search.createColumn({name:'custrecord_hc_scar_shipment_plan_line'}),
                            search.createColumn({name:'internalid'})

                        ]
                    })
                    let sku_ret = runsearch(sku_search).getAllData
                    log.debug('sku_ret',sku_ret)

                    if(sku_ret && sku_ret.length > 0){
                        for(let ssr = 0;ssr < sku_ret.length;ssr++){
                            let ss_internalid = sku_ret[ssr].getValue('internalid')
                            if(sku_json[ss_internalid] == null || sku_json[ss_internalid] == '' || sku_json[ss_internalid] == undefined){
                                sku_json[ss_internalid] = {}
                            }
                            sku_json[ss_internalid].custrecord_hc_scar_freight_by_unit = sku_ret[ssr].getValue('custrecord_hc_scar_freight_by_unit')
                            sku_json[ss_internalid].custrecord_hc_scar_duty_charges_by_unit = sku_ret[ssr].getValue('custrecord_hc_scar_duty_charges_by_unit')
                            sku_json[ss_internalid].custrecord_hc_scar_other_fees_by_unit = sku_ret[ssr].getValue('custrecord_hc_scar_other_fees_by_unit')
                            sku_json[ss_internalid].custrecord_hc_scar_shipping_order = sku_ret[ssr].getValue('custrecord_hc_scar_shipping_order')
                            sku_json[ss_internalid].custrecord_hc_scar_shipping_order_line = sku_ret[ssr].getValue('custrecord_hc_scar_shipping_order_line')
                            sku_json[ss_internalid].custrecordhc_scar_customcharges_by_unit = sku_ret[ssr].getValue('custrecordhc_scar_customcharges_by_unit')
                            sku_json[ss_internalid].custrecord_hc_scar_shipment_plan_line = sku_ret[ssr].getValue('custrecord_hc_scar_shipment_plan_line')

                            if(!ship_order){
                                ship_order = sku_json[ss_internalid].custrecord_hc_scar_shipping_order
                                ship_order_text = sku_ret[ssr].getText('custrecord_hc_scar_shipping_order')

                            }
                        }
                    }
                }
                log.debug('ship_order',ship_order)

                if(ship_order){
                    let order_search = search.create({
                        type:'customrecord_hc_global_logistics_cost',
                        filters:[
                            ["custrecord_hc_glc_bill_order.custrecord_hc_glcb_shipping_order","anyof",ship_order],
                            'AND',
                            ['isinactive','is','F']
                        ],
                        columns:[
                            search.createColumn({name:'custrecord_hc_glc_cost_type'}),//LANDED COST
                            search.createColumn({name:'custrecord_hc_glc_forwarder'}),//供应商
                            search.createColumn({name:'custrecord_hc_glcb_shipping_order',join:'custrecord_hc_glc_bill_order'}),
                            search.createColumn({name:'custrecord_hc_glc_bill_order'}),//LANDED COST
                        ]
                    })
                    let os_ret = runsearch(order_search).getAllData
                    log.debug('os_ret',os_ret)

                    for(let oos = 0;oos < os_ret.length;oos++){
                        let gsorder = os_ret[oos].getValue({name:'custrecord_hc_glcb_shipping_order',join:'custrecord_hc_glc_bill_order'})
                        if(os_json[gsorder] == undefined || os_json[gsorder] == null || os_json[gsorder] == ''){
                            os_json[gsorder] = []
                        }
                        os_json[gsorder].push(os_ret[oos])
                        bill_order = os_ret[oos].getValue('custrecord_hc_glc_bill_order')
                    }
                }

                for(let ia_is = 1;ia_is < data_value.length;ia_is++){
                    let line_qty = data_value[ia_is].quantity;
                    let line_land_cost = data_value[ia_is].costrecord;
                    let line_item = data_value[ia_is].item;

                    let line_sku_cost = sku_json[line_land_cost]

                    let line_gos = os_json[ship_order]
                    let line_location = data_value[ia_is].location;

                    for(let lg = 0;lg < line_gos.length;lg++){
                        let cost_type = line_gos[lg].getValue('custrecord_hc_glc_cost_type')
                        let cost_vendor = line_gos[lg].getValue('custrecord_hc_glc_forwarder')
                        let cost_filed = lande_cost[cost_type].field
                        let cost_account = lande_cost[cost_type].account
                        let cost_name = lande_cost[cost_type].name
                        let unit_cost = line_sku_cost[cost_filed] || 0
                        let line_amount = accMul(unit_cost,line_qty)
                        let debit_data = {
                            account:debit_account,
                            amount:line_amount,
                            item:line_item,
                            location:line_location,
                            entity:'',
                            fx:'debit'
                        }
                        let credit_data = {
                            account:cost_account,
                            amount:line_amount,
                            item:line_item,
                            location:line_location,
                            entity:cost_vendor,
                            fx:'credit',
                            costname:cost_name
                        }
                        je_data.push(debit_data)
                        je_data.push(credit_data)
                    }



                }
                log.debug('je_data',je_data)
                if(je_data.length > 0){
                    let ia_record = record.load({
                        type:'inventoryadjustment',
                        id:iaid
                    })
                    let subsidiay = ia_record.getValue('subsidiary')
                    let trandate = ia_record.getValue('trandate')
                    let je_record = record.create({
                        type:'journalentry'
                    })
                    je_record.setValue('subsidiary',subsidiay)
                    je_record.setValue('trandate',trandate)
                    je_record.setValue('custbody_hc_applied_shipping_order',ship_order)
                    je_record.setValue('custbody_hc_create_from_ia',iaid)
                    je_record.setValue('custbody_hc_logistics_bill',bill_order)
                    je_record.setValue('approvalstatus',2)
                    for(let jd = 0;jd<je_data.length;jd++){
                        let line_data = je_data[jd]
                        je_record.setSublistValue({sublistId:'line',fieldId:'account',value:line_data.account,line:jd})
                        if(line_data.fx == 'debit'){
                            je_record.setSublistValue({sublistId:'line',fieldId:'debit',value:line_data.amount,line:jd})
                            je_record.setSublistValue({sublistId:'line',fieldId:'location',value:line_data.location,line:jd})

                        }else{
                            je_record.setSublistValue({sublistId:'line',fieldId:'credit',value:line_data.amount,line:jd})
                            je_record.setSublistValue({sublistId:'line',fieldId:'entity',value:line_data.entity,line:jd})
                            je_record.setSublistValue({sublistId:'line',fieldId:'memo',value:ship_order_text+line_data.costname+'预估',line:jd})

                        }
                        je_record.setSublistValue({sublistId:'line',fieldId:'custcol_hc_fulfill_item',value:line_data.item,line:jd})
                    }
                    let je_id = je_record.save({enableSourcing: true,ignoreMandatoryFields: true})
                    ia_record.setValue('custbody_hc_logistic_cost_je',je_id)
                    ia_record.save({enableSourcing: true,ignoreMandatoryFields: true})
                }

            }catch (e) {
                log.error('e',e)
            }
        }

        /**
         * Defines the function that is executed when the reduce entry point is triggered. This entry point is triggered
         * automatically when the associated map stage is complete. This function is applied to each group in the provided context.
         * @param {Object} reduceContext - Data collection containing the groups to process in the reduce stage. This parameter is
         *     provided automatically based on the results of the map stage.
         * @param {Iterator} reduceContext.errors - Serialized errors that were thrown during previous attempts to execute the
         *     reduce function on the current group
         * @param {number} reduceContext.executionNo - Number of times the reduce function has been executed on the current group
         * @param {boolean} reduceContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} reduceContext.key - Key to be processed during the reduce stage
         * @param {List<String>} reduceContext.values - All values associated with a unique key that was passed to the reduce stage
         *     for processing
         * @since 2015.2
         */
        const reduce = (reduceContext) => {
            const data_value = JSON.parse(reduceContext.values[0]);
            log.debug('data_value',data_value)
        }


        /**
         * Defines the function that is executed when the summarize entry point is triggered. This entry point is triggered
         * automatically when the associated reduce stage is complete. This function is applied to the entire result set.
         * @param {Object} summaryContext - Statistics about the execution of a map/reduce script
         * @param {number} summaryContext.concurrency - Maximum concurrency number when executing parallel tasks for the map/reduce
         *     script
         * @param {Date} summaryContext.dateCreated - The date and time when the map/reduce script began running
         * @param {boolean} summaryContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Iterator} summaryContext.output - Serialized keys and values that were saved as output during the reduce stage
         * @param {number} summaryContext.seconds - Total seconds elapsed when running the map/reduce script
         * @param {number} summaryContext.usage - Total number of governance usage units consumed when running the map/reduce
         *     script
         * @param {number} summaryContext.yields - Total number of yields when running the map/reduce script
         * @param {Object} summaryContext.inputSummary - Statistics about the input stage
         * @param {Object} summaryContext.mapSummary - Statistics about the map stage
         * @param {Object} summaryContext.reduceSummary - Statistics about the reduce stage
         * @since 2015.2
         */
        const summarize = (summaryContext) => {

        }

        function runsearch(searchitem){
            var allpage = 1;
            var DataResult = searchitem.runPaged({pageSize: 1000});
            var totalcount = DataResult.count;
            if(totalcount>1000){
                allpage = Math.ceil(totalcount/1000);
            }
            var getAllData = [];
            for(var i=0;i<allpage && totalcount>0;i++){
                //取值
                var currentpage = DataResult.fetch({index: i});
                //是否是最后页
                var isLast = currentpage.isLast;
                //数据
                var data = currentpage.data;
                getAllData = getAllData.concat(data);

                if(isLast){
                    break;
                }
            }
            var ret = {};
//  	        ret.columns = Search.columns;
            ret.getAllData = getAllData;
            return ret;
        }
        function accMul(arg1, arg2) {
            var m = 0, s1 = arg1.toString(), s2 = arg2.toString();
            try { m += s1.split(".")[1].length } catch (e) { }
            try { m += s2.split(".")[1].length } catch (e) { }
            return Number(s1.replace(".", "")) * Number(s2.replace(".", "")) / Math.pow(10, m)
        }



        return {getInputData, map, reduce, summarize}

    });
