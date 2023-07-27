/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
// ccy/
define(['N/runtime'],

function(runtime) {
   
    /**
     * Definition of the Scheduled script trigger point.
     *
     * @param {Object} scriptContext
     * @param {string} scriptContext.type - The context in which the script is executed. It is one of the values from the scriptContext.InvocationType enum.
     * @Since 2015.2
     */
	var account_params = null;
    function get_account_param(name) {
		var accountId = runtime.accountId;
		if(accountId == 'TSTDRV1939883'){
			if(!params){
				account_params = product_params();
			}
		}
		else if(accountId == '5141176_SB1'){
			if(!params){
				account_params = SB1_params();
			}
		}
		else{
			throw 'aaa';
		}
		return account_params[name];
    }

	function product_params(){
		return {
		};
	}

	function SB1_params(){
		return {
		};
	}


	function get_script_param(name){
		return runtime.getCurrentScript().getParameter({name: name});
	}

    return {
        get_account_param: get_account_param,
		get_script_param: get_script_param,
    };
    
});
