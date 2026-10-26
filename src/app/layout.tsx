import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "Boards",
  description: "Team tasks arranged on boards, lists, and cards.",
  applicationName: "Boards",
  appleWebApp: { capable: true, title: "Boards", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0079bf",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full antialiased" suppressHydrationWarning>
        <Script id="strip-extension-attrs" strategy="beforeInteractive">
          {`(function(){
var extra=/^(bis_|__processed_)/;
function clean(el){
  if(!el||el.nodeType!==1)return;
  var attrs=el.attributes;
  for(var i=attrs.length-1;i>=0;i--){
    if(extra.test(attrs[i].name))el.removeAttribute(attrs[i].name);
  }
}
function walk(node){
  if(!node||node.nodeType!==1)return;
  clean(node);
  for(var child=node.firstElementChild;child;child=child.nextElementSibling)walk(child);
}
var root=document.documentElement;
walk(root);
new MutationObserver(function(records){
  for(var i=0;i<records.length;i++){
    var record=records[i];
    if(record.type==="attributes")clean(record.target);
    var added=record.addedNodes;
    for(var j=0;j<added.length;j++)walk(added[j]);
  }
}).observe(root,{subtree:true,childList:true,attributes:true});
})();`}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
