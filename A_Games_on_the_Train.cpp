#include <iostream>
#include <bits/stdc++.h>
using namespace std;

int main(){
    int t;
    cin>>t;
    while(t--){
        int n;
        vector<int>arr;
        cin>>n;
        int x;
        for(int i=0;i<n;i++){
            cin>>x;
            arr.push_back(x);
        }

        int m= arr.size();
        sort(arr.begin(),arr.end());
        cout<<(arr[m-1]+1-arr[0])<<endl;
        
        
    }
}