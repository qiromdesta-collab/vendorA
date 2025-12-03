
const express=require('express');
const pool=require('./db');
const app=express();

app.get('/vendor-a', async (req,res)=>{
  const data=[
    {"kd_produk":"A001","nm_brg":"Kopi Bubuk 100g","hrg":"15000","ket_stok":"ada"},
    {"kd_produk":"A002","nm_brg":"Gula Merah","hrg":"12500","ket_stok":"habis"}
  ];
  for(const p of data){
    await pool.query(
      `INSERT INTO vendor_products(vendor,code,name,price,stock) VALUES($1,$2,$3,$4,$5)`,
      ["VendorA", p.kd_produk, p.nm_brg, parseInt(p.hrg), p.ket_stok]
    );
  }
  res.json(data);
});
app.listen(3001,()=>console.log("M1"));