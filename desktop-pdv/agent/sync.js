class SyncEngine {
  constructor({ store, apiBase, tokenProvider, onState, appVersion='0.3.0' }) {
    this.store=store; this.apiBase=apiBase.replace(/\/$/,''); this.tokenProvider=tokenProvider; this.onState=onState||(()=>{}); this.appVersion=appVersion; this.timer=null; this.running=false;
  }
  headers(){ const token=this.tokenProvider(); return { 'content-type':'application/json', ...(token?{authorization:`Bearer ${token}`}:{}) }; }
  async request(path,body){ const response=await fetch(`${this.apiBase}${path}`,{method:'POST',headers:this.headers(),body:JSON.stringify(body||{})}); const data=await response.json().catch(()=>({ok:false,error:`http_${response.status}`})); if(!response.ok||!data.ok) throw new Error(data.error||`http_${response.status}`); return data; }
  start(){ if(this.timer) return; this.timer=setInterval(()=>this.run().catch(()=>{}),5000); this.run().catch(()=>{}); }
  stop(){ if(this.timer) clearInterval(this.timer); this.timer=null; }
  async run(){ if(this.running||!this.tokenProvider()) return {ok:false,error:'not_enrolled'}; this.running=true; this.onState({syncing:true}); try{
      const pending=this.store.pending(100);
      if(pending.length){
        const push=await this.request('/api/pdv/push',{events:pending.map(({id,type,payload})=>({id,type,payload}))});
        for(const r of push.results||[]){ if(r.status==='processed') this.store.markProcessed(r.id,r.result); else this.store.markRejected(r.id,r.error); }
      }
      const pull=await this.request('/api/pdv/pull',{since:this.store.get('cursor')||null});
      this.store.applyPull(pull);
      if(Array.isArray(pull.staff_users)) this.store.set('staff_users',JSON.stringify(pull.staff_users));
      if(Array.isArray(pull.payment_integrations)) this.store.set('payment_integrations',JSON.stringify(pull.payment_integrations));
      await this.request('/api/pdv/heartbeat',{appVersion:this.appVersion,capabilities:{offline:true,printing:true,serial:true,fiscalMenu:true,returns:true,pdf:true,configurableShortcuts:true,operators:true,multiPayment:true,cashDrawer:true,scale:true,tefBridge:true},metrics:{queue:this.store.queueStats(),operatorId:this.store.get('current_operator_id')||null}});
      this.store.set('last_sync_at',new Date().toISOString()); this.store.set('last_sync_error',''); this.onState({online:true,syncing:false,lastSyncAt:this.store.get('last_sync_at')}); return {ok:true,pull};
    }catch(error){ this.store.set('last_sync_error',error.message); for(const p of this.store.pending(100)) this.store.markRetry(p.id,error.message); this.onState({online:false,syncing:false,error:error.message}); return {ok:false,error:error.message}; }
    finally{this.running=false;}
  }
}
module.exports={SyncEngine};
