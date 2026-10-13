import {useEffect,useState} from "react";
import {api, type CatalogPage,type Resource} from "./shared";

export function CatalogPager({after,next,previous,advance,back}: {after:string;next:string;previous:boolean;advance:()=>void;back:()=>void}) {
  return <div className="section-toolbar"><small>每页最多 100 项{after?" · 当前为后续页":""}</small><div className="button-row"><button className="button" disabled={!previous} onClick={back}>上一页</button><button className="button" disabled={!next} onClick={advance}>下一页</button></div></div>;
}

// Selectors fetch their own page. Changing the visible page never drops pinned
// bindings; selected versions outside this page remain explicit and removable.
export function useBindingCatalog(kind:string) {
  const [query,setQuery]=useState(""),[after,setAfter]=useState(""),[items,setItems]=useState<Resource[]>([]),[next,setNext]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let live=true;
    setLoading(true);setError("");setItems([]);setNext("");
    const timer=setTimeout(()=>{
      void api<CatalogPage>("/catalog?"+new URLSearchParams({kind,q:query,after})).then(p=>{
        if(!live)return;
        setItems(p.items);setNext(p.next_cursor);
        setError(Object.values(p.services).some(x=>!x)?"部分目录暂不可用，已绑定版本仍保留。":"");
      }).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});
    },200);
    return()=>{live=false;clearTimeout(timer)};
  },[kind,query,after]);
  const prepare=()=>{setLoading(true);setItems([]);setNext("");setError("")};
  return {items,next,error,after,query,loading,
    search:(q:string)=>{if(q===query && !after)return;prepare();setQuery(q);setAfter("")},
    advance:()=>{if(!next)return;prepare();setAfter(next)},
    reset:()=>{if(!after)return;prepare();setAfter("")}};
}
