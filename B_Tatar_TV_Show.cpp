#include <iostream>
#include <bits/stdc++.h>
using namespace std;

// f() function removed entirely because we no longer need the first '1' index

int main(){
    int t;
    cin>>t;
    while(t--){
        int n,k;
        vector<int>arr;
        cin>>n>>k;
        
        char x; // MINIMAL CHANGE 1: Read as char since the binary string has no spaces
        for(int i=0;i<n;i++){
            cin>>x;
            arr.push_back(x - '0'); // Convert the char '0'/'1' to an actual int 0/1
        }

        int m = arr.size();
        
        // MINIMAL CHANGE 2: Array to count the '1's for each modulo group
        vector<int> count(k, 0); 
        
        for(int i=0; i<m; i++){
            if(arr[i] == 1){
                count[i % k]++; // Group elements separated by exactly k steps
            }
        }
        
        int c=0;
        for(int i=0; i<k; i++){
            if(count[i] % 2 != 0){ // If any group has an odd number of 1s, it's impossible
                c++;
            }
        }
        
        if(c>0){
            cout<<"NO"<<endl;
        }
        else{
            cout<<"YES"<<endl;
        }
    }
}